# Phần mềm tra cứu văn bản điện tử QTDND

Ứng dụng web tĩnh (HTML/CSS/JS thuần, không cần máy chủ, không cần mạng) để tra cứu văn bản pháp quy về quỹ tín dụng nhân dân. Tài liệu lưu hành nội bộ.

Nội dung lấy từ Ebook CHM “EBOOK_VANBAN_QTDND_202607”: **81 văn bản** (Luật, Nghị định, Thông tư, Văn bản hợp nhất, Quyết định và các tài liệu Nội dung mới – Hỏi đáp), chia thành 15 nhóm theo mục lục của Ebook. Phần “TÓM TẮT” không đưa vào.

## Chạy

Mở `index.html` bằng trình duyệt (hoặc `npx http-server .`). Giữ nguyên cấu trúc thư mục `css/`, `js/`, `data/`. Mở trực tiếp bằng `file://` vẫn chạy.

## Tính năng

- Tìm kiếm toàn văn theo từng Điều, **không cần gõ dấu**, khớp theo đầu từ, tô sáng từ khóa; tra theo số hiệu (ví dụ `73/2025`); lọc theo nhóm; tìm riêng trong một văn bản.
- Danh sách văn bản: lọc theo tên/số hiệu và loại văn bản, sắp xếp theo mục lục Ebook / mới ban hành / số hiệu.
- Trang đọc: mục lục Chương/Mục/Điều có lọc, đánh dấu Điều đang đọc, sao chép liên kết từng Điều, chỉnh cỡ chữ, chế độ sáng/tối, in.
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
pip install beautifulsoup4 lxml
python3 -I tools/build_data.py ebook/ data/
```

Script đọc danh mục từ `help.hhc`, tự nhận Chương/Mục/Điều/Phụ lục, số hiệu, ngày ban hành, chú thích cuối văn bản và lịch sử sửa đổi, rồi in danh sách “LƯU Ý” các điểm cần người rà soát.

## Lưu ý về dữ liệu

- Chưa gắn nhãn hiệu lực văn bản; sẽ bổ sung khi có danh sách văn bản hết hiệu lực.
- Ngày ban hành chỉ hiển thị khi nội dung văn bản có ghi; không tự suy đoán.
- Mục `64_VBHN` (hợp nhất Thông tư 01/2025, 63/2025, 15/2026 về cấp Giấy phép QTDND) có trong mục lục Ebook nhưng **không có tệp** trong CHM nên chưa đưa vào.
- Văn bản hợp nhất 08, 44, 26/VBHN-NHNN và Quyết định 493/2005/QĐ-NHNN không ghi số hiệu trong nội dung; số hiệu lấy theo tên mục trong Ebook.
- Thông tư 73/2025 đánh số Chương I, II, IV, V (không có Chương III) theo đúng văn bản gốc.
