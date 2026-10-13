# Phần mềm tra cứu văn bản điện tử QTDND Lộc Sơn

Ứng dụng web tĩnh (HTML/CSS/JS thuần, không cần máy chủ, không cần mạng) để tra cứu văn bản pháp quy về quỹ tín dụng nhân dân. Tài liệu lưu hành nội bộ.

Nội dung lấy từ Ebook CHM “EBOOK_VANBAN_QTDND_202607”: **81 văn bản** (Luật, Nghị định, Thông tư, Văn bản hợp nhất, Quyết định và các tài liệu Nội dung mới – Hỏi đáp), chia thành 15 nhóm theo mục lục của Ebook. 11 văn bản có thêm bản **tóm tắt** do người biên soạn Ebook viết (tab “Tóm tắt”, mở mặc định cho các văn bản này).

Ngoài Ebook (tổng cộng 83 văn bản), có thêm hai văn bản từ tệp Word do người dùng cung cấp (lưu ở `tools/sources/`):

- **Thông tư 40/2026/TT-NHNN**, xếp đầu nhóm “Các giới hạn, tỷ lệ bảo đảm an toàn hoạt động”.
- **Văn bản hợp nhất 07/VBHN-NHNN** (hợp nhất Thông tư 01/2014, 12/2017, 14/2019, 19/2021, 05/2025), xếp trong nhóm “Hoạt động an toàn kho quỹ”; trang Thông tư 01/2014 có thông báo trỏ tới bản hợp nhất này.

## Chạy

Mở `index.html` bằng trình duyệt (hoặc `npx http-server .`). Giữ nguyên cấu trúc thư mục `css/`, `js/`, `data/`. Mở trực tiếp bằng `file://` vẫn chạy.

## Tính năng

- Tìm kiếm toàn văn theo từng Điều, **không cần gõ dấu**, khớp theo đầu từ, tô sáng từ khóa; tra theo số hiệu (ví dụ `73/2025`); lọc theo nhóm; tìm riêng trong một văn bản.
- Danh sách văn bản: lọc theo tên/số hiệu và loại văn bản, sắp xếp theo mục lục Ebook / mới ban hành / số hiệu.
- Trang đọc: mục lục Chương/Mục/Điều có lọc, đánh dấu Điều đang đọc, sao chép liên kết từng Điều, chỉnh cỡ chữ, chế độ sáng/tối, in.
- Tab “Tóm tắt” (bảng tổng quan, nghĩa vụ, quyền hạn, chế tài…) giúp nắm nhanh văn bản; nút lọc “★ Có tóm tắt” ở danh sách; kết quả tìm kiếm cũng tìm trong phần tóm tắt.
- Văn bản hợp nhất có tab “Lịch sử sửa đổi” (lấy từ phần mở đầu văn bản); chú thích cuối văn bản bấm xem ngay tại chỗ.
- Dữ liệu tải theo nhu cầu: danh mục nạp ngay, từng văn bản nạp khi mở, chỉ mục tìm kiếm nạp khi tìm.
- Hiển thị tốt trên điện thoại.

## Cấu trúc dữ liệu (`data/`)

| Tệp | Nội dung |
|---|---|
| `catalog.js` | Danh mục nhóm + văn bản |
| `docs/<id>.js` | Nội dung từng văn bản |
| `search.js` | Chỉ mục tìm kiếm theo từng Điều |

## Tạo lại dữ liệu từ file CHM

```bash
7z x EBOOK_VANBAN_QTDND_202607.CHM -oebook/        # giải nén CHM
pip install beautifulsoup4 lxml python-docx
python3 -I tools/build_data.py ebook/ data/
```

Script đọc danh mục từ `help.hhc` (và các tệp .docx khai báo trong `EXTRA_DOCS`), tự nhận Chương/Mục/Điều/Phụ lục, số hiệu, ngày ban hành, chú thích cuối văn bản và lịch sử sửa đổi, rồi in danh sách “LƯU Ý” các điểm cần người rà soát.

## Lưu ý về dữ liệu

- Chưa gắn nhãn hiệu lực văn bản; sẽ bổ sung khi có danh sách văn bản hết hiệu lực.
- Ngày ban hành chỉ hiển thị khi nội dung văn bản có ghi; không tự suy đoán.
- Mục `64_VBHN` (hợp nhất Thông tư 01/2025, 63/2025, 15/2026 về cấp Giấy phép QTDND) có trong mục lục Ebook nhưng **không có tệp** trong CHM nên chưa đưa vào.
- Văn bản hợp nhất 08, 44, 26/VBHN-NHNN và Quyết định 493/2005/QĐ-NHNN không ghi số hiệu trong nội dung; số hiệu lấy theo tên mục trong Ebook.
- Thông tư 73/2025 đánh số Chương I, II, IV, V (không có Chương III) theo đúng văn bản gốc.
- Thông tư 40/2026/TT-NHNN (Điều 15) ghi hiệu lực từ 01/11/2026 và bãi bỏ Thông tư 32/2015/TT-NHNN, 13/2024/TT-NHNN; ứng dụng chưa gắn nhãn hiệu lực cho các văn bản này.
