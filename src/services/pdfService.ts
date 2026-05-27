import * as pdfMake from 'pdfmake/build/pdfmake';
import * as pdfFonts from 'pdfmake/build/vfs_fonts';
import { TDocumentDefinitions } from 'pdfmake/interfaces';

// Fix for pdfmake internal structure and initialization
const pM = (pdfMake as any).default || pdfMake;
const pF = (pdfFonts as any).default || pdfFonts;

const vfFonts = pF?.pdfMake?.vfs || pF?.vfs || (pdfFonts as any).vfs;
if (vfFonts) {
  pM.vfs = vfFonts;
}

export interface DesignItem {
  name: string;
  amount: number;
  notes?: string;
  imageUrl?: string; // Base64 string for PDF
}

export interface InvoiceData {
  customerName: string;
  date: string;
  files: {
    fileName: string;
    width: number;
    length: number;
    adjustedLength: number;
    fileDate?: string;
  }[];
  totalLength: number;
  unitPrice?: number;
  designItems?: DesignItem[];
}

export const pdfService = {
  generateInvoice: async (data: InvoiceData) => {
    if (!pM || typeof pM.createPdf !== 'function') {
      console.error('pdfMake.createPdf is not available:', pM);
      throw new Error('Không thể khởi tạo bộ tạo PDF. Vui lòng thử lại.');
    }

    const printTotalAmount = data.unitPrice ? data.totalLength * data.unitPrice : 0;
    const designTotalAmount = data.designItems?.reduce((sum, item) => sum + item.amount, 0) || 0;
    const finalGrandTotal = printTotalAmount + designTotalAmount;
    
    // Print Table Table
    const printTableBody: any[][] = [
      [
        { text: 'STT', style: 'tableHeader', alignment: 'center' },
        { text: 'Tên Sơ Đồ', style: 'tableHeader' },
        { text: 'Khổ (cm)', style: 'tableHeader', alignment: 'center' },
        { text: 'Dài (m)', style: 'tableHeader', alignment: 'right' },
      ]
    ];

    if (data.unitPrice) {
      printTableBody[0].push({ text: 'Đơn giá', style: 'tableHeader', alignment: 'right' });
      printTableBody[0].push({ text: 'Thành tiền', style: 'tableHeader', alignment: 'right' });
    }

    // Helper to format date
    const formatDate = (dateStr?: string) => {
      if (!dateStr) return 'Khác';
      try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return 'Khác';
        return d.toLocaleDateString('vi-VN');
      } catch {
        return 'Khác';
      }
    };

    // Group files by date
    const groupedFiles: Record<string, typeof data.files> = {};
    data.files.forEach(f => {
      const day = formatDate(f.fileDate);
      if (!groupedFiles[day]) {
        groupedFiles[day] = [];
      }
      groupedFiles[day].push(f);
    });

    // Sort days chronologically
    const sortedDays = Object.keys(groupedFiles).sort((a, b) => {
      if (a === 'Khác') return 1;
      if (b === 'Khác') return -1;
      const parseDate = (str: string) => {
        const parts = str.split('/');
        if (parts.length === 3) {
          return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0])).getTime();
        }
        return 0;
      };
      return parseDate(a) - parseDate(b);
    });

    let overallIndex = 1;

    sortedDays.forEach(day => {
      const filesForDay = groupedFiles[day];
      const dayTotalLength = filesForDay.reduce((sum, f) => sum + f.adjustedLength, 0);

      // Add a Day Header row
      const numCols = data.unitPrice ? 6 : 4;
      const dayHeaderRow = [
        { text: `Ngày ${day}`, colSpan: numCols, bold: true, fontSize: 8.5, fillColor: '#eff6ff', margin: [0, 1.5] }
      ];
      // add remaining empty cells to satisfy colSpan
      for (let c = 1; c < numCols; c++) {
        dayHeaderRow.push({} as any);
      }
      printTableBody.push(dayHeaderRow);

      // Add files for this day
      filesForDay.forEach(f => {
        const row = [
          { text: (overallIndex++).toString(), alignment: 'center', fontSize: 8 },
          { text: f.fileName, fontSize: 8 },
          { text: f.width.toFixed(1), alignment: 'center', fontSize: 8 },
          { text: f.adjustedLength.toFixed(2), alignment: 'right', fontSize: 8 },
        ];

        if (data.unitPrice) {
          row.push({ text: data.unitPrice.toLocaleString('vi-VN'), alignment: 'right', fontSize: 8 } as any);
          row.push({ text: (f.adjustedLength * data.unitPrice).toLocaleString('vi-VN'), alignment: 'right', fontSize: 8 } as any);
        }

        printTableBody.push(row);
      });

      // Add a Day Subtotal row
      const daySubtotalRow = [
        {},
        { text: `Cộng ngày ${day}`, alignment: 'right', bold: true, fontSize: 8, color: '#2563eb' },
        {},
        { text: `${dayTotalLength.toFixed(2)} m`, alignment: 'right', bold: true, fontSize: 8, color: '#2563eb' },
      ];
      if (data.unitPrice) {
        daySubtotalRow.push({});
        daySubtotalRow.push({ text: `${(dayTotalLength * data.unitPrice).toLocaleString('vi-VN')} VNĐ`, alignment: 'right', bold: true, fontSize: 8, color: '#2563eb' });
      }
      printTableBody.push(daySubtotalRow);
    });

    const content: any[] = [
      { text: 'HOÁ ĐƠN DỊCH VỤ IN & THIẾT KẾ', style: 'header', alignment: 'center' },
      { text: 'PLT MANAGER - GARBER TECH SOLUTION', style: 'subheader', alignment: 'center', margin: [0, 0, 0, 8] },
      
      {
        columns: [
          {
            width: '*',
            stack: [
              { text: [{ text: 'Khách hàng: ', bold: true }, data.customerName] },
              { text: [{ text: 'Ngày lập: ', bold: true }, new Date().toLocaleString('vi-VN')] },
              { text: [{ text: 'Kỳ dữ liệu: ', bold: true }, data.date] },
            ],
            lineHeight: 1.15
          },
        ],
        margin: [0, 0, 0, 10]
      },
      
      { text: '1. CHI TIẾT IN DỮ LIỆU', style: 'sectionTitle', margin: [0, 6, 0, 4] },
      {
        table: {
          headerRows: 1,
          dontBreakRows: true,
          widths: data.unitPrice ? [20, '*', 40, 40, 55, 65] : [20, '*', 45, 55],
          body: printTableBody
        },
        layout: {
          hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length) ? 1 : 0.5,
          vLineWidth: () => 0,
          hLineColor: (i: number) => (i === 0) ? '#3b82f6' : '#e5e7eb',
          paddingLeft: () => 6,
          paddingRight: () => 6,
          paddingTop: () => 4,
          paddingBottom: () => 4
        }
      },
      {
        columns: [
          { text: '', width: '*' },
          { text: 'Tổng in:', width: 130, alignment: 'right', bold: true, fontSize: 8.5, margin: [0, 3] },
          { text: `${data.totalLength.toFixed(2)} m`, width: 90, alignment: 'right', bold: true, fontSize: 8.5, margin: [0, 3] },
        ]
      },
    ];

    if (data.unitPrice) {
      content.push({
        columns: [
          { text: '', width: '*' },
          { text: 'T.Tiền in:', width: 130, alignment: 'right', bold: true, fontSize: 9, margin: [0, 1] },
          { text: `${printTotalAmount.toLocaleString('vi-VN')} VNĐ`, width: 110, alignment: 'right', bold: true, fontSize: 9, margin: [0, 1] }
        ]
      });
    }

    // Design items section
    if (data.designItems && data.designItems.length > 0) {
      content.push({ text: '2. CHI TIẾT THIẾT KẾ MẪU', style: 'sectionTitle', margin: [0, 10, 0, 5] });
      
      const designTableBody: any[][] = [];
      const columnsCount = 4; // 4 items per row
      const tempRow: any[] = [];
      
      for (let i = 0; i < data.designItems.length; i++) {
        const item = data.designItems[i];
        
        const cellStack: any[] = [];
        if (item.imageUrl) {
          cellStack.push({
            image: item.imageUrl,
            width: 45,
            alignment: 'center',
            margin: [0, 1, 0, 2]
          });
        } else {
          cellStack.push({
            text: 'Không có ảnh',
            fontSize: 7,
            color: '#9ca3af',
            alignment: 'center',
            margin: [0, 8, 0, 8]
          });
        }
        
        cellStack.push({
          text: `${i + 1}. ${item.name}`,
          bold: true,
          fontSize: 7.5,
          alignment: 'center',
          color: '#1f2937'
        });
        
        if (item.notes) {
          cellStack.push({
            text: item.notes,
            fontSize: 6.5,
            color: '#4b5563',
            alignment: 'center',
            margin: [0, 0.5, 0, 0]
          });
        }
        
        cellStack.push({
          text: `${item.amount.toLocaleString('vi-VN')} đ`,
          bold: true,
          fontSize: 7.5,
          color: '#2563eb',
          alignment: 'center',
          margin: [0, 1, 0, 1]
        });
        
        tempRow.push({
          stack: cellStack,
          fillColor: '#f9fafb',
          margin: [1, 1, 1, 1]
        });
        
        // When row is full
        if (tempRow.length === columnsCount) {
          designTableBody.push([...tempRow]);
          tempRow.length = 0;
        }
      }
      
      // If there are remaining items in tempRow, fill the rest with empty cells
      if (tempRow.length > 0) {
        while (tempRow.length < columnsCount) {
          tempRow.push({ text: '', fillColor: '#ffffff' });
        }
        designTableBody.push([...tempRow]);
      }
      
      content.push({
        table: {
          widths: Array(columnsCount).fill('*'),
          dontBreakRows: true,
          body: designTableBody
        },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => '#e5e7eb',
          vLineColor: () => '#e5e7eb',
          paddingLeft: () => 1.5,
          paddingRight: () => 1.5,
          paddingTop: () => 3,
          paddingBottom: () => 3
        },
        margin: [0, 2, 0, 5]
      });

      content.push({
        columns: [
          { text: '', width: '*' },
          { text: 'Tổng thiết kế:', width: 130, alignment: 'right', bold: true, fontSize: 9 },
          { text: `${designTotalAmount.toLocaleString('vi-VN')} VNĐ`, width: 110, alignment: 'right', bold: true, fontSize: 9 }
        ],
        margin: [0, 3, 0, 0]
      });
    }

    // Grand Total
    content.push({
      canvas: [{ type: 'line', x1: 320, y1: 5, x2: 555, y2: 5, lineWidth: 1, lineColor: '#dc2626' }],
      margin: [0, 6]
    });

    content.push({
      columns: [
        { text: '', width: '*' },
        { text: 'TỔNG CỘNG THANH TOÁN:', width: 200, alignment: 'right', bold: true, color: '#dc2626', fontSize: 11 },
        { text: `${finalGrandTotal.toLocaleString('vi-VN')} VNĐ`, width: 130, alignment: 'right', bold: true, color: '#dc2626', fontSize: 11 },
      ],
      margin: [0, 3]
    });

    // Signature Area
    content.push({
      margin: [0, 20, 0, 0],
      columns: [
        {
          stack: [
            { text: 'Bên giao', bold: true, alignment: 'center', fontSize: 9 },
            { text: '(Ký và ghi rõ họ tên)', fontSize: 7.5, color: '#666', alignment: 'center', margin: [0, 2] }
          ]
        },
        {
          stack: [
            { text: 'Bên nhận', bold: true, alignment: 'center', fontSize: 9 },
            { text: '(Ký và ghi rõ họ tên)', fontSize: 7.5, color: '#666', alignment: 'center', margin: [0, 2] }
          ]
        }
      ]
    });

    const docDefinition: TDocumentDefinitions = {
      content: content,
      styles: {
        header: {
          fontSize: 14,
          bold: true,
          margin: [0, 0, 0, 3]
        },
        subheader: {
          fontSize: 8.5,
          color: '#666'
        },
        sectionTitle: {
          fontSize: 10,
          bold: true,
          color: '#3b82f6',
          decoration: 'underline'
        },
        tableHeader: {
          bold: true,
          fontSize: 8.5,
          color: 'white',
          fillColor: '#3b82f6',
        }
      },
      defaultStyle: {
        font: 'Roboto'
      },
      pageSize: 'A4',
      pageMargins: [20, 20, 20, 20],
      footer: (currentPage: number, pageCount: number) => {
        return {
          text: `Trang ${currentPage} / ${pageCount}`,
          alignment: 'center',
          fontSize: 7.5,
          color: '#aaa',
          margin: [0, 6]
        };
      }
    };

    pM.createPdf(docDefinition).download(`HoaDon_${data.customerName.replace(/\s/g, '_')}_${data.date.replace(/\//g, '-')}.pdf`);
  }
};
