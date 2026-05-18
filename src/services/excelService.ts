import * as XLSX from 'xlsx';
import { InvoiceData } from './pdfService';

export const excelService = {
  generateInvoice: (data: InvoiceData) => {
    // 1. Prepare Header Info
    const headerInfo = [
      ['HOÁ ĐƠN DỊCH VỤ IN & THIẾT KẾ'],
      ['PLT MANAGER - GARBER TECH SOLUTION'],
      [''],
      ['Khách hàng:', data.customerName],
      ['Ngày lập:', new Date().toLocaleString('vi-VN')],
      ['Kỳ dữ liệu:', data.date],
      [''],
      ['1. CHI TIẾT IN DỮ LIỆU']
    ];

    // 2. Prepare Print Table
    const printHeaders = ['STT', 'Tên Sơ Đồ', 'Khổ (cm)', 'Dài (m)'];
    if (data.unitPrice) {
      printHeaders.push('Đơn giá', 'Thành tiền');
    }

    const printRows = data.files.map((f, i) => {
      const row = [
        i + 1,
        f.fileName,
        f.width,
        f.adjustedLength
      ];
      if (data.unitPrice) {
        row.push(data.unitPrice, f.adjustedLength * data.unitPrice);
      }
      return row;
    });

    const printTotalRow = ['', 'Tổng cộng', '', data.totalLength];
    if (data.unitPrice) {
      printTotalRow.push('', data.totalLength * data.unitPrice);
    }

    // 3. Prepare Design Table
    const designHeader = ['', ''];
    const designItemsHeader = ['2. CHI TIẾT THIẾT KẾ MẪU'];
    const designTableHeaders = ['STT', 'Tên mẫu', 'Số tiền', 'Ghi chú'];
    const designRows = (data.designItems || []).map((item, i) => [
      i + 1,
      item.name,
      item.amount,
      item.notes || ''
    ]);
    
    const designTotalAmount = data.designItems?.reduce((sum, item) => sum + item.amount, 0) || 0;
    const designTotalRow = ['', 'Tổng thiết kế', designTotalAmount, ''];

    // 4. Grand Total
    const grandTotal = (data.unitPrice ? data.totalLength * data.unitPrice : 0) + designTotalAmount;
    const grandTotalRow = ['', 'TỔNG CỘNG THANH TOÁN', grandTotal, 'VNĐ'];

    // Combine all to worksheet data
    let wsData: any[] = [...headerInfo, printHeaders, ...printRows, printTotalRow];
    
    if (data.designItems && data.designItems.length > 0) {
      wsData.push(['']);
      wsData.push(designItemsHeader);
      wsData.push(designTableHeaders);
      wsData.push(...designRows);
      wsData.push(designTotalRow);
    }

    wsData.push(['']);
    wsData.push(grandTotalRow);

    // Create Worksheet
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Style adjustments (optional basic ones)
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "HoaDon");

    // Generate and Download
    XLSX.writeFile(wb, `HoaDon_${data.customerName.replace(/\s/g, '_')}_${data.date.replace(/\//g, '-')}.xlsx`);
  }
};
