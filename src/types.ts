export interface PLTFileRecord {
  id: string;
  userId?: string;
  fileName: string;
  customerName: string;
  originalWidth: number; // meters
  originalLength: number; // meters
  adjustedLength: number; // meters
  isOverWidth: boolean;
  createdAt: string; // ISO date
  fileDate: string; // File creation date (from metadata)
}

export interface Customer {
  id: string;
  userId?: string;
  name: string;
}

export interface CodeMapping {
  code: string;
  userId?: string;
  customerName: string;
}
