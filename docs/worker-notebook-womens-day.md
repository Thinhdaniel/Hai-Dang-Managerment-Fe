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

- Bản v2: đầu trang là thiệp hoa vải, có đường may và nét chỉ; thiết kế riêng desktop/mobile.
- Mặc định hiển thị thiệp đầy đủ ở cả hai loại màn hình. Người dùng có thể thu gọn để đưa thao tác ghi công lên gần đầu trang.
- Người dùng có thể mở/thu gọn; lựa chọn lưu trong localStorage, riêng theo tài khoản và phiên bản sự kiện.
- Bản v2 dùng khóa lưu riêng, không kế thừa lựa chọn thu gọn của giao diện v1.
- Bó hoa/nét chỉ chỉ xuất hiện có chuyển động một lần mỗi phiên trình duyệt, không chạy lại khi chuyển tab trong sổ.
- Nút “Mở thiệp” mở hộp thoại có hiệu ứng gấp/mở: không tự mở khi đăng nhập. Đóng bằng Esc, nút đóng hoặc “Về sổ của tôi”; trả focus về nút mở.
- Nếu trình duyệt chặn storage, lời chúc vẫn hoạt động nhưng không lưu lựa chọn.
- Tôn trọng `prefers-reduced-motion`; không âm thanh, không popup tự mở, không suy đoán giới tính.
- Ngày 20/10 có dấu hoa nhỏ trong lịch khi sự kiện đang hiển thị, không thay màu chấm công hoặc dấu tăng ca.

## Nội dung được duyệt

Lời chúc giữ nguyên văn câu được người dùng chọn, không thêm đoạn cảm ơn do AI viết.
Nguồn: [Vĩnh Phúc Logistics](https://vinhphuclogistics.com.vn/tin-tuc/chuc-mung-ngay-phu-nu-viet-nam-20-10/).
Nội dung và nguồn nằm trong `WOMENS_DAY_GREETING`; tên Hải Đăng là dòng người gửi riêng.

## Thiết kế v2

- Canvas `#FAF8FC`, giấy thiệp `#FFFAFC`, vải hồng `#F6DCE7`, mận `#693953`, hồng trầm `#A64C74`; nút nghiệp vụ giữ xanh `#3154DC`.
- Georgia chỉ dùng cho tiêu đề thiệp; Be Vietnam Pro giữ nguyên cho dữ liệu, biểu mẫu và điều hướng.
- Thiệp căn chữ trái; bó hoa vải ở phải, đường may làm viền. Bên dưới giữ toàn bộ bố cục ghi công cũ.
- Header có hoa nhỏ, nền/border của trang sổ đồng bộ nhẹ. Không đổi màu biểu thị công/tăng ca, không tự suy đoán giới tính.

```text
Thiệp: [20/10 · Ngày Phụ nữ Việt Nam] [Bó hoa bằng vải]
       [Mở thiệp] [Thu gọn]
Sổ:    [Ngày + chọn ngày] [Thanh tuần]
       [Chấm công]       [Công đoạn + ghi sản lượng]
```

## Hình minh họa

Asset: `public/brand/womens-day-bouquet-v2.webp`, 960 × 960, khoảng 226 KiB, giữ nền trong suốt.
Tạo bằng công cụ imagegen tích hợp; chuyển định dạng/dung lượng cho web, không sửa nội dung bó hoa.
Ảnh PNG gốc được giữ nguyên ở thư mục generated_images. Không cần tải ảnh từ dịch vụ ngoài khi xem trang.

Prompt đã dùng:

> Use case: stylized-concept. Asset type: transparent cutout illustration for a Vietnamese garment-company Women's Day digital greeting card. Subject: one beautifully hand-crafted bouquet made entirely from fabric: 5 rose and peony blooms formed from folded blush pink and dusty mauve satin ribbons, a few ivory organza petals, muted sage fabric leaves, stems gently gathered in a soft mauve satin bow with two graceful ribbon tails. Materials must visibly be textile, with fine woven grain, subtle stitching and realistic folded edges; not natural flowers. Style: premium tactile still-life, art-directed soft 3D with photographic fabric detail, bright elegant editorial feel, soft directional studio light and dimensional shadows contained in the object. Composition: upright bouquet, full silhouette and both ribbon tails inside frame with generous transparent margins, slightly asymmetric, square canvas. Palette: blush #F5B9CF, mauve #9B5876, ivory white #FCFAFC, sage #82947A. Constraints: actual transparent background, no backdrop, no text, no letters, no logos, no watermark, no vase, no hands, no people, no glitter, no extra objects.

## Kiểm tra

`npm run test:worker-event` (Node.js 22.18+ hoặc 24+) kiểm tra khoảng ngày, ranh giới
múi giờ và khóa lưu lựa chọn. Kiểm tra UI trên 320/390/768/1280 px, thu gọn sau tải lại,
chuyển ba tab, ghi công/sản lượng và đổi mật khẩu. Thử cả giảm chuyển động và storage bị chặn.
Thêm kiểm tra mở/đóng thiệp, focus/keyboard, ảnh WebP đã tải, giữ nguyên lời chúc, màn hình thấp 568 px.
