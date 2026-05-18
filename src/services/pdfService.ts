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

    data.files.forEach((f, i) => {
      const row = [
        { text: (i + 1).toString(), alignment: 'center', fontSize: 10 },
        { text: f.fileName, fontSize: 10 },
        { text: f.width.toFixed(1), alignment: 'center', fontSize: 10 },
        { text: f.adjustedLength.toFixed(2), alignment: 'right', fontSize: 10 },
      ];

      if (data.unitPrice) {
        row.push({ text: data.unitPrice.toLocaleString('vi-VN'), alignment: 'right', fontSize: 10 } as any);
        row.push({ text: (f.adjustedLength * data.unitPrice).toLocaleString('vi-VN'), alignment: 'right', fontSize: 10 } as any);
      }

      printTableBody.push(row);
    });

    const content: any[] = [
      { text: 'HOÁ ĐƠN DỊCH VỤ IN & THIẾT KẾ', style: 'header', alignment: 'center' },
      { text: 'PLT MANAGER - GARBER TECH SOLUTION', style: 'subheader', alignment: 'center', margin: [0, 0, 0, 20] },
      
      {
        columns: [
          {
            width: '*',
            stack: [
              { text: [{ text: 'Khách hàng: ', bold: true }, data.customerName] },
              { text: [{ text: 'Ngày lập: ', bold: true }, new Date().toLocaleString('vi-VN')] },
              { text: [{ text: 'Kỳ dữ liệu: ', bold: true }, data.date] },
            ],
            lineHeight: 1.4
          },
        ],
        margin: [0, 0, 0, 20]
      },
      
      { text: '1. CHI TIẾT IN DỮ LIỆU', style: 'sectionTitle', margin: [0, 10, 0, 8] },
      {
        table: {
          headerRows: 1,
          widths: data.unitPrice ? [25, '*', 45, 45, 60, 70] : [25, '*', 50, 60],
          body: printTableBody
        },
        layout: {
          hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length) ? 1 : 0.5,
          vLineWidth: () => 0,
          hLineColor: (i: number) => (i === 0) ? '#3b82f6' : '#e5e7eb',
          paddingLeft: () => 8,
          paddingRight: () => 8,
          paddingTop: () => 6,
          paddingBottom: () => 6
        }
      },
      {
        columns: [
          { text: '', width: '*' },
          { text: 'Tổng in:', width: 150, alignment: 'right', bold: true, fontSize: 10, margin: [0, 5] },
          { text: `${data.totalLength.toFixed(2)} m`, width: 100, alignment: 'right', bold: true, fontSize: 10, margin: [0, 5] },
        ]
      },
    ];

    if (data.unitPrice) {
      content.push({
        columns: [
          { text: '', width: '*' },
          { text: 'T.Tiền in:', width: 150, alignment: 'right', bold: true, fontSize: 11, margin: [0, 2] },
          { text: `${printTotalAmount.toLocaleString('vi-VN')} VNĐ`, width: 120, alignment: 'right', bold: true, fontSize: 11, margin: [0, 2] }
        ]
      });
    }

    // Design items section
    if (data.designItems && data.designItems.length > 0) {
      content.push({ text: '2. CHI TIẾT THIẾT KẾ MẪU', style: 'sectionTitle', margin: [0, 25, 0, 8] });
      
      data.designItems.forEach((item, idx) => {
        const itemStack: any[] = [
          {
            columns: [
              {
                width: '*',
                stack: [
                  { text: `${idx + 1}. ${item.name}`, bold: true, fontSize: 12 },
                  item.notes ? { text: `Ghi chú: ${item.notes}`, fontSize: 10, color: '#666', margin: [0, 2] } : null,
                  { text: `Số tiền: ${item.amount.toLocaleString('vi-VN')} VNĐ`, bold: true, margin: [0, 5] }
                ].filter(Boolean)
              }
            ]
          }
        ];

        if (item.imageUrl) {
          itemStack[0].columns.push({
            image: item.imageUrl,
            width: 100,
            alignment: 'right'
          });
        }

        content.push({
          stack: itemStack,
          margin: [0, 5, 0, 10],
          border: [false, false, false, true],
          borderColor: '#f3f4f6'
        });
      });

      content.push({
        columns: [
          { text: '', width: '*' },
          { text: 'Tổng thiết kế:', width: 150, alignment: 'right', bold: true, fontSize: 11 },
          { text: `${designTotalAmount.toLocaleString('vi-VN')} VNĐ`, width: 120, alignment: 'right', bold: true, fontSize: 11 }
        ],
        margin: [0, 5, 0, 0]
      });
    }

    // Grand Total
    content.push({
      canvas: [{ type: 'line', x1: 300, y1: 10, x2: 515, y2: 10, lineWidth: 1, lineColor: '#dc2626' }],
      margin: [0, 10]
    });

    content.push({
      columns: [
        { text: '', width: '*' },
        { text: 'TỔNG CỘNG THANH TOÁN:', width: 220, alignment: 'right', bold: true, color: '#dc2626', fontSize: 15 },
        { text: `${finalGrandTotal.toLocaleString('vi-VN')} VNĐ`, width: 140, alignment: 'right', bold: true, color: '#dc2626', fontSize: 15 },
      ],
      margin: [0, 5]
    });

    // Signature Area
    content.push({
      margin: [0, 50, 0, 0],
      columns: [
        {
          stack: [
            { text: 'Bên giao', bold: true, alignment: 'center' },
            { text: '(Ký và ghi rõ họ tên)', fontSize: 9, color: '#666', alignment: 'center', margin: [0, 5] }
          ]
        },
        {
          stack: [
            { text: 'Bên nhận', bold: true, alignment: 'center' },
            { text: '(Ký và ghi rõ họ tên)', fontSize: 9, color: '#666', alignment: 'center', margin: [0, 5] }
          ]
        }
      ]
    });

    const docDefinition: TDocumentDefinitions = {
      content: content,
      styles: {
        header: {
          fontSize: 20,
          bold: true,
          margin: [0, 0, 0, 5]
        },
        subheader: {
          fontSize: 10,
          color: '#666'
        },
        sectionTitle: {
          fontSize: 12,
          bold: true,
          color: '#3b82f6',
          decoration: 'underline'
        },
        tableHeader: {
          bold: true,
          fontSize: 10,
          color: 'white',
          fillColor: '#3b82f6',
        }
      },
      defaultStyle: {
        font: 'Roboto'
      },
      pageSize: 'A4',
      pageMargins: [40, 40, 40, 40],
      footer: (currentPage: number, pageCount: number) => {
        return {
          text: `Trang ${currentPage} / ${pageCount}`,
          alignment: 'center',
          fontSize: 8,
          color: '#aaa',
          margin: [0, 10]
        };
      }
    };

    pM.createPdf(docDefinition).download(`HoaDon_${data.customerName.replace(/\s/g, '_')}_${data.date.replace(/\//g, '-')}.pdf`);
  }
};
