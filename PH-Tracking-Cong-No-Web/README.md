# PH Tracking Công Nợ

Bộ tracking mới nhất dành cho PH PLT Manager 1.7.0. Trang tracking hiển thị số
lần in, tổng mét sau khi nhân số lần in, đơn giá, thiết kế mẫu và thanh toán.

Website tĩnh cho khách hàng xem công nợ theo link:

```text
https://ten-mien-cua-ban/congno-tenkhach
```

## Triển khai Vercel

1. Tạo project Vercel mới.
2. Chọn thư mục `tracking-site` làm Root Directory.
3. Framework Preset: `Other`.
4. Deploy.
5. Trong PH PLT Manager, nhập domain Vercel vào ô **Tên miền tracking**.

File `vercel.json` đã cấu hình rewrite để mọi slug mở đúng trang tracking.
