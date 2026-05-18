/**
 * PLT (HPGL) Parser Utility
 * Units: 1 mm = 40 HPGL units (standard)
 */

export interface PLTDimensions {
  width: number; // in meters
  length: number; // in meters
  isOverWidth: boolean;
  adjustedLength: number;
}

export function parsePLT(content: string): { width: number; length: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  let currX = 0;
  let currY = 0;
  let lastCommand = '';
  let extractedLengthFromLabel = 0;
  let extractedWidthFromLabel = 0;
  
  // Standard HPGL is 40 units per mm = 40,000 units per meter (1016 units per inch).
  const scaleFactor = 40000; 

  // Normalize: remove line breaks and tabs, but keep spaces as they can be separators
  const data = content.replace(/[\r\n\t]/g, ' ');
  
  let i = 0;
  while (i < data.length) {
    // Skip whitespace and semicolons
    if (data[i] <= ' ' || data[i] === ';') {
      i++;
      continue;
    }

    // Check if we have a command (two uppercase letters)
    if (i + 1 < data.length && /[A-Z]/.test(data[i]) && /[A-Z]/.test(data[i+1])) {
      lastCommand = data.substring(i, i + 2).toUpperCase();
      i += 2;
    } else if (/[A-Z]/.test(data[i])) {
      i++;
      continue;
    }

    // Collect parameters until the next command or semicolon
    let paramsStr = '';
    let terminator = '\x03'; // Default HPGL terminator is ETX (Ctrl+C)
    
    // Some files define a custom terminator with DT
    if (lastCommand === 'DT') {
      if (i < data.length) terminator = data[i];
    }

    while (i < data.length && data[i] !== ';') {
      // For LB, we read until the terminator
      if (lastCommand === 'LB' && data[i] === terminator) {
        i++; // skip terminator
        break;
      }
      // For other commands, we stop at the next command
      if (lastCommand !== 'LB' && i + 1 < data.length && /[A-Z]/.test(data[i]) && /[A-Z]/.test(data[i+1])) {
        break;
      }
      paramsStr += data[i];
      i++;
    }

    // Process coordinates for IP and PS commands which define bounds
    if (lastCommand === 'IP' || lastCommand === 'PS') {
      const numbers = paramsStr.match(/-?\d*\.?\d+/g);
      if (numbers) {
        for (let j = 0; j < numbers.length; j += 2) {
          if (j + 1 >= numbers.length) break;
          const x = parseFloat(numbers[j]);
          const y = parseFloat(numbers[j+1]);
          if (!isNaN(x) && !isNaN(y)) {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
          }
        }
      }
    }

    // Attempt to extract length and width from labels (common in garment industry)
    if (lastCommand === 'LB') {
      // Include the current cursor position in bounding box for labels too
      // This helps if the label is the only thing at an edge
      if (currX !== 0 || currY !== 0) { // Avoid origin unless it's a real coordinate
        minX = Math.min(minX, currX);
        maxX = Math.max(maxX, currX);
        minY = Math.min(minY, currY);
        maxY = Math.max(maxY, currY);
      }

      // Stricter match: L= or L: must be preceded by a non-word character or start of string
      // and must be a standalone identifier (not part of a word like "LABEL" or "FILE")
      const lengthSection = paramsStr.match(/(?:^|[^A-Z])L\s*[:=]\s*([^W\r\n;]+)/i);
      if (lengthSection) {
        // Look for values like 1.5M, 150CM, 1500MM
        const parts = lengthSection[1].match(/(\d+\.?\d*)\s*(M|CM|MM)/gi);
        if (parts) {
          let totalMeters = 0;
          parts.forEach(part => {
            const match = part.match(/(\d+\.?\d*)\s*(M|CM|MM)/i);
            if (match) {
              let val = parseFloat(match[1]);
              const unit = match[2].toUpperCase();
              if (unit === 'CM') val /= 100;
              else if (unit === 'MM') val /= 1000;
              totalMeters += val;
            }
          });
          if (totalMeters > 0) extractedLengthFromLabel = totalMeters;
        } else {
          // Try also matching just numbers if it's clearly a length field
          const plainNumMatch = lengthSection[1].match(/^(\d+\.?\d*)$/);
          if (plainNumMatch) {
            let val = parseFloat(plainNumMatch[1]);
            // Heuristic: If it's > 50 it's probably CM, else M
            if (val > 50) val /= 100;
            extractedLengthFromLabel = val;
          }
        }
      }

      // Stricter match for Width
      const widthMatch = paramsStr.match(/(?:^|[^A-Z])W\s*[:=]\s*(\d+\.?\d*)\s*(M|CM|MM)?/i);
      if (widthMatch) {
        let val = parseFloat(widthMatch[1]);
        const unit = (widthMatch[2] || 'CM').toUpperCase();
        if (unit === 'CM') val /= 100;
        else if (unit === 'MM') val /= 1000;
        extractedWidthFromLabel = val;
      }
    }

    // Process drawing commands
    if (['PA', 'PD', 'PU', 'PR'].includes(lastCommand)) {
      const numbers = paramsStr.match(/-?\d*\.?\d+/g);
      if (numbers) {
        for (let j = 0; j < numbers.length; j += 2) {
          if (j + 1 >= numbers.length) break;
          
          const val1 = parseFloat(numbers[j]);
          const val2 = parseFloat(numbers[j + 1]);
          
          if (!isNaN(val1) && !isNaN(val2)) {
            if (lastCommand === 'PR') {
              currX += val1;
              currY += val2;
            } else {
              currX = val1;
              currY = val2;
            }
            
            minX = Math.min(minX, currX);
            maxX = Math.max(maxX, currX);
            minY = Math.min(minY, currY);
            maxY = Math.max(maxY, currY);
          }
        }
      }
    }
  }

  if (minX === Infinity) return { width: 0, length: 0 };

  const dimX = Math.abs(maxX - minX) / scaleFactor;
  const dimY = Math.abs(maxY - minY) / scaleFactor;

  // Garment industry logic:
  // 1. Identify Width (Khổ): Usually the dimension that matches paper width (1.5m - 1.9m)
  // 2. Identify Length (Dài): The other dimension.
  
  let length, width;
  
  // Heuristic: Width is usually the dimension closest to standard paper widths (e.g. 1.6m, 1.7m, 1.8m)
  // and Length is the one that varies. 
  // In most plotters, X is Length and Y is Width.
  if (dimY >= 1.4 && dimY <= 2.2 && (dimX < 1.4 || dimX > 2.2)) {
    // dimY is likely the Width
    width = dimY;
    length = dimX;
  } else if (dimX >= 1.4 && dimX <= 2.2 && (dimY < 1.4 || dimY > 2.2)) {
    // dimX is likely the Width
    width = dimX;
    length = dimY;
  } else {
    // Default: X is Length, Y is Width
    length = dimX;
    width = dimY;
  }

  // Logic to reconcile bounding box with extracted labels:
  // 1. If we have a label, it is often the "net marker length".
  // 2. The bounding box might be slightly larger because of "outside info" (tech/inner header info).
  // 3. We should prefer the larger dimension if they are close, to ensure we account for all printed content.
  if (extractedLengthFromLabel > 0) {
    // If the bounding box is slightly larger (up to 50cm more), it's likely technical info/extra text.
    // We want to capture this!
    if (length >= extractedLengthFromLabel && length < extractedLengthFromLabel + 0.5) {
      // Use the bounding box length (nothing to override)
    } else if (extractedLengthFromLabel > length * 0.8 && extractedLengthFromLabel < length + 0.05) {
      // If label is slightly larger than bounding box (e.g. margin defined in label but not drawn), trust label.
      length = extractedLengthFromLabel;
    } else if (extractedLengthFromLabel > length * 0.2 || length < 0.5) {
      // Fallback: trust label if it's in a totally different scale than bounding box (stray point protection)
      length = extractedLengthFromLabel;
    }
  }
  
  // Apply similar logic for width
  if (extractedWidthFromLabel > 0) {
    if (width >= extractedWidthFromLabel && width < extractedWidthFromLabel + 0.2) {
      // Use bounding box width
    } else {
      width = extractedWidthFromLabel;
    }
  }

  // Final safeguard: ensure length is always at least 0.01
  length = Math.max(0.01, length);
  width = Math.max(0.01, width);
  
  // Round up to 2 decimal places as requested
  length = Math.ceil(length * 100) / 100;

  return { width, length };
}

export function calculateAdjustedDimensions(width: number, length: number): PLTDimensions {
  const isOverWidth = width > 1.84;
  const adjustedLength = isOverWidth ? length * 2 : length;
  
  return {
    width,
    length,
    isOverWidth,
    adjustedLength
  };
}
