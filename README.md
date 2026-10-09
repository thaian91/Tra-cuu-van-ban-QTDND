# Phần mềm tra cứu văn bản điện tử QTDND

Ứng dụng web tĩnh (HTML/CSS/JS thuần, không cần máy chủ, không cần mạng) để tra cứu văn bản pháp quy về quỹ tín dụng nhân dân. Tài liệu lưu hành nội bộ.

**Bản mẫu** gồm 4 văn bản lấy từ Ebook CHM “EBOOK_VANBAN_QTDND_202607”:

| Văn bản | Có tóm tắt | Ghi chú |
|---|---|---|
| Thông tư 27/2024/TT-NHNN | ✔ | Quỹ bảo đảm an toàn hệ thống |
| Thông tư 28/2025/TT-NHNN | ✔ | Sửa đổi TT 27/2024 |
| Văn bản hợp nhất 58/VBHN-NHNN | – | Có dòng thời gian sửa đổi, chú thích cuối văn bản |
| Thông tư 73/2025/TT-NHNN | ✔ | Thủ tục chấp thuận thay đổi |

## Chạy

Mở `index.html` bằng trình duyệt (hoặc `npx http-server .`). Dữ liệu nằm ở `data/data.js` nên mở trực tiếp bằng `file://` vẫn chạy.

## Tính năng

- Tìm kiếm toàn văn theo từng Điều, **không cần gõ dấu**, khớp theo đầu từ, tô sáng từ khóa.
- Trang đọc: mục lục Chương/Mục/Điều có lọc, đánh dấu Điều đang đọc, sao chép liên kết từng Điều, chỉnh cỡ chữ, chế độ sáng/tối, in.
- Tab Toàn văn / Tóm tắt / Lịch sử sửa đổi; chú thích cuối văn bản bấm xem ngay tại chỗ.
- Hiển thị tốt trên điện thoại.

## Tạo lại dữ liệu từ file CHM

```bash
7z x EBOOK_VANBAN_QTDND_202607.CHM -oebook/        # giải nén CHM
pip install beautifulsoup4 lxml
python3 -I tools/build_data.py ebook/ data/data.js
```

Muốn thêm văn bản: thêm một dòng vào danh sách `SAMPLE` trong `tools/build_data.py` rồi chạy lại.

## Lưu ý

- Chưa gắn nhãn hiệu lực văn bản; sẽ bổ sung khi có danh sách văn bản hết hiệu lực.
- Văn bản gốc Thông tư 73/2025 đánh số Chương I, II, IV, V (không có Chương III); ứng dụng giữ nguyên như nguồn.
