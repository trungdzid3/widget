# Chế độ xử lý mã hóa và ký tự (Encoding & Characters)

## 1. Tiêu chuẩn mã hóa (Encoding Standard)
- **Luôn luôn** sử dụng bảng mã **UTF-8 (không có BOM)** cho tất cả các tệp tin được tạo mới hoặc chỉnh sửa.
- Tuyệt đối không sử dụng các bảng mã khác như Windows-1252, ISO-8859-1 hoặc UTF-16 trừ khi có yêu cầu đặc biệt.

## 2. Xử lý tiếng Việt và ký tự đặc biệt
- Đảm bảo các ký tự tiếng Việt có dấu (Unicode) được viết trực tiếp và hiển thị đúng định dạng.
- Ví dụ: Sử dụng "Xin chào" thay vì "Xin ch\u00e0o" (trừ khi tệp tin yêu cầu định dạng escape sequence như JSON hoặc tệp cấu hình đặc thù).
- Khi đọc tệp hiện có, nếu phát hiện lỗi font hoặc ký tự lạ, hãy thực hiện chuyển đổi (convert) nội dung tệp đó sang UTF-8 trước khi thực hiện các thay đổi khác.

## 3. Kiểm tra trước khi lưu (Pre-save Validation)
- Trước khi phản hồi mã nguồn, hãy tự kiểm tra xem các chuỗi ký tự (strings) và chú thích (comments) có bị biến dạng ký tự (mojibake) hay không.
- Nếu tệp tin chứa các ký tự non-ASCII, hãy thêm dòng khai báo mã hóa ở đầu tệp nếu ngôn ngữ lập trình đó hỗ trợ (Ví dụ: `# -*- coding: utf-8 -*-` trong Python).

## 4. Cấu hình môi trường (Environment Consistency)
- Giả định rằng môi trường VS Code của người dùng đã được thiết lập `files.encoding: "utf8"`.
- Không tự ý thay đổi các thiết lập liên quan đến kết thúc dòng (End of Line) ngoại trừ việc giữ nguyên định dạng hiện tại của tệp (LF hoặc CRLF).