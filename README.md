# Web — Gã Thợ Rèn Ở Xứ Sở Thần Kỳ

```
tools/chapters.json     danh sách chương: tiêu đề, màu nền, màu nhấn, trang bắt đầu trong PDF, published
tools/extract_book.py   lấy ảnh từ "dan trang.pdf", tìm ảnh gốc độ phân giải cao trong "boi canh/", xuất WebP
tools/build.py          đọc các file .docx + ảnh -> tạo site/
src/assets/             CSS + JS (sửa ở đây, không sửa trong site/)
site/                   kết quả: đem nguyên thư mục này lên Cloudflare Pages / Netlify / Vercel
```

## Khi viết xong chương mới

1. Xuất lại `dan trang.pdf` từ InDesign.
2. Thêm chương vào `tools/chapters.json` (`page` = số trang PDF có tiêu đề chương, đếm từ 0).
3. Chạy:

```
python tools/extract_book.py
python tools/build.py
python -m http.server 8000 -d site
```

Mở http://localhost:8000 để xem.

Bản đăng trên claude.ai: https://claude.ai/artifact/YFLabL7x9REt65g8yXxoDg
(dựng bằng `python tools/build.py --artifact` → thư mục `artifact/`, rồi nhờ Claude đăng lại vào đúng link này).

## GitHub Pages

```
python tools/build.py --pages   ->  docs/  (đường dẫn tương đối, chạy được trong thư mục con)
```

Trên GitHub: Settings > Pages > Source: "Deploy from a branch", Branch `main`, thư mục `/docs` > Save.
Trang sẽ ở https://toiladuyminh1997-ui.github.io/porfolio_3D/

Các bản cũ: `docs/vNN/` (ảnh dùng chung `docs/img`), danh sách ở `docs/phien-ban.html`
→ https://toiladuyminh1997-ui.github.io/porfolio_3D/phien-ban.html — `build.py --pages` không xoá các thư mục này.
Trước khi đăng bản mới: chép bản đang chạy thành `docs/vNN/`, thêm một dòng vào `phien-ban.html`, `git tag vNN`.

Ảnh "sống" trong phần Đọc (cây lay, nước gợn, người thở) dùng bản đồ chuyển động:
`python tools/motion_maps.py` (cần mô hình ONNX trong `tools/.cache/models/`, xem đầu file) rồi build lại.

## WordPress

```
python tools/build.py --wp      ->  wordpress/ga-tho-ren.zip  (theme + 10 chương + ảnh)
```

Mã theme nằm ở `src/wp-theme/` (PHP), dùng chung `src/assets/` với bản web.

1. WordPress > Giao diện > Theme > Thêm mới > Tải theme lên > chọn `ga-tho-ren.zip` > Kích hoạt.
   (Zip ~45MB. Nếu hosting báo quá giới hạn tải lên: giải nén, chép thư mục `ga-tho-ren`
   vào `wp-content/themes/` bằng FTP / File Manager của hosting, rồi kích hoạt.)
2. Giao diện > Nhập sách > bấm **Nhập sách** (ảnh vào Thư viện Media, chương thành bài "Chương").
3. Cài đặt > Đường dẫn tĩnh: chọn "Tên bài viết" (để link chương dạng /chuong/chuong-1/).
4. Chữ trang chủ: Giao diện > Tùy biến > Trang sách. Thêm chương: menu Sách > Thêm chương.

Muốn ẩn một chương (ví dụ chỉ đăng thử vài chương đầu): đặt `"published": false`.
