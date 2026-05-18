# Tổng quan Kiến trúc Ứng dụng Quản lý Sơ đồ PLT

Tài liệu này mô tả chi tiết cách thức hoạt động của ứng dụng để nhà phát triển có thể dễ dàng bảo trì và mở rộng.

## 1. Frontend (Giao diện người dùng)
- **Framework:** React 18 với Vite.
- **Ngôn ngữ:** TypeScript (đảm bảo an toàn kiểu dữ liệu).
- **Styling:** Tailwind CSS (sử dụng các class tiện ích để thiết kế nhanh và phản hồi tốt).
- **Icons:** Lucide-React.
- **Biểu đồ:** Recharts (dùng để hiển thị thống kê sản lượng).
- **Xử lý ngày tháng:** `date-fns` (định dạng tiếng Việt).

### Các thành phần chính:
- `src/App.tsx`: Chứa toàn bộ logic giao diện, quản lý state (Files, Customers, Mappings) và các Tab chức năng.
- `src/lib/pltParser.ts`: "Trái tim" của ứng dụng, chứa logic đọc dữ liệu nhị phân từ file `.plt` để trích xuất tọa độ và tính toán kích thước (Ngang, Dài).
- `src/services/dbService.ts`: Lớp trung gian (Data Access Layer) kết nối Frontend với Supabase.

## 2. Backend (Hậu cần)
Ứng dụng sử dụng kiến trúc **Serverless** thông qua **Supabase JS SDK**. 
- Không có server Node.js riêng biệt để giảm chi phí và đơn giản hóa việc deploy (Sẵn sàng đẩy lên Vercel/Netlify).
- Toàn bộ các truy vấn CRUD (Create, Read, Update, Delete) được thực hiện trực tiếp từ trình duyệt tới Supabase API.

## 3. Database (Cơ sở dữ liệu)
Sử dụng **Supabase (PostgreSQL)** với 3 bảng chính:

### a. Bảng `customers` (Khách hàng)
Lưu danh sách tên khách hàng để phân loại sơ đồ.
- `id`: UUID (Khóa chính)
- `name`: Text (Tên khách hàng, duy nhất)
- `created_at`: Timestamp

### b. Bảng `code_mappings` (Quy tắc gợi ý)
Lưu quy tắc: Mã file này thuộc về khách hàng nào. Dùng để tự động gợi ý khi bạn upload file mới có tên tương tự.
- `code`: Text (Khóa chính - ví dụ: "AO_KHOAC")
- `customer_name`: Text (Tên khách hàng tương ứng)

### c. Bảng `plt_files` (Lịch sử in ấn)
Lưu chi tiết từng file đã được xử lý và lưu trữ.
- `id`: UUID (Khóa chính)
- `file_name`: Tên file gốc.
- `customer_name`: Khách hàng được gán.
- `original_width`: Khổ ngang gốc.
- `original_length`: Chiều dài gốc.
- `adjusted_length`: Chiều dài sau khi tính toán bù hao.
- `is_over_width`: Đánh dấu nếu sơ đồ vượt khổ máy in (185cm).
- `file_date`: Ngày giờ của file (lấy từ lastModified).
- `created_at`: Ngày giờ lưu vào hệ thống.

## 4. Luồng dữ liệu (Data Flow)
1. **Upload:** Người dùng chọn file `.plt` hoặc thư mục.
2. **Parsing:** App đọc file, tính kích thước.
3. **Phân loại:** App tách mã từ tên file, tra cứu trong bảng `code_mappings` để tìm khách hàng cũ. Nếu không thấy, nó sẽ gợi ý dựa trên lịch sử gần nhất hoặc để trống.
4. **Lưu trữ:** Khi nhấn "Lưu", dữ liệu được đẩy vào `plt_files` và cập nhật lại `code_mappings` để thông minh hơn ở lần sau.

## 5. Deployment (Triển khai)
Ứng dụng được cấu hình để dễ dàng triển khai lên **Vercel**:
1. Đẩy code lên GitHub.
2. Kết nối GitHub với Vercel.
3. Thêm 2 biến môi trường vào Vercel (Environment Variables):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Vercel sẽ tự động Build và cung cấp link truy cập công khai.
