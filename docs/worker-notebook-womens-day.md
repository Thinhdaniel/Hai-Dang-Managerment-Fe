# Giao diện Sổ của tôi dịp 20/10/2026

Chỉ áp dụng cho tài khoản `worker` trong trang `/my-notebook`. Không thay đổi API,
quyền truy cập, dữ liệu ghi công, sản lượng, báo cáo hay chức năng đổi mật khẩu.

## Lịch hiển thị

- Từ 00:00 ngày 07/10/2026 đến hết ngày 24/10/2026, múi giờ `Asia/Ho_Chi_Minh`.
- Tự tắt từ 00:00 ngày 25/10/2026; không tự lặp lại năm sau.
- Kiểm tra lại ngày mỗi 30 giây và khi tab được mở lại. Đồng hồ máy người dùng cần đúng.
- Cấu hình nằm trong `src/components/worker-notebook/notebook-event.ts`.

## Xem trước trên máy phát triển

Chạy `npm run dev`, mở `/my-notebook?notebookEvent=women-day` bằng tài khoản công nhân.
Tham số này chỉ có tác dụng trong chế độ phát triển (`import.meta.env.DEV`). Bản build
production bỏ qua tham số. Xem trước **không** thay đổi ngày làm việc và không cho
nhập ngày tương lai. Không cần sửa dữ liệu hay chỉnh đồng hồ hệ thống.

## Hành vi

- Desktop mặc định mở lời chúc; điện thoại mặc định thu gọn để giữ thao tác ghi công gần đầu trang.
- Người dùng có thể mở/thu gọn; lựa chọn lưu trong localStorage, riêng theo tài khoản và phiên bản sự kiện.
- Hoa đường chỉ chạy một lần mỗi phiên trình duyệt, không chạy lại khi chuyển tab trong sổ.
- Nếu trình duyệt chặn storage, lời chúc vẫn hoạt động nhưng không lưu lựa chọn.
- Tôn trọng `prefers-reduced-motion`; không âm thanh, không popup tự mở, không suy đoán giới tính.
- Ngày 20/10 có dấu hoa nhỏ trong lịch khi sự kiện đang hiển thị, không thay màu chấm công hoặc dấu tăng ca.

## Kiểm tra

`npm run test:worker-event` (Node.js 22.18+ hoặc 24+) kiểm tra khoảng ngày, ranh giới
múi giờ và khóa lưu lựa chọn. Kiểm tra UI trên 320/390/768/1280 px, thu gọn sau tải lại,
chuyển ba tab, ghi công/sản lượng và đổi mật khẩu. Thử cả giảm chuyển động và storage bị chặn.
