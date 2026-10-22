"""Dựng lại từng trang đôi của bản dàn trang (PDF) thành HTML: chữ, ảnh, mảng màu nằm đúng vị trí.

Mỗi trang đôi là một <section class="spread"> có tỉ lệ đúng khổ sách; mọi phần tử định vị bằng %
(và cỡ chữ theo cqw = % bề ngang trang đôi), nên co giãn theo màn hình mà vẫn giữ bố cục.
Trên điện thoại (CSS), các phần tử thôi định vị tuyệt đối và xếp lần lượt theo từng trang:
hình của trang rồi chữ của trang đó, cỡ chữ dễ đọc.
"""
import html
import json
import os
import pymupdf

_ATLAS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'site', 'img', 'motion', 'atlas.json')
MOTION_ATLAS = json.load(open(_ATLAS)) if os.path.exists(_ATLAS) else {}   # tools/motion_maps.py
FONT_CLASS = (('aptima', 'f-ap'), ('lora', 'f-lo'), ('roboto', 'f-ro'))


def _font_class(name):
    n = name.lower()
    return next((c for k, c in FONT_CLASS if k in n), 'f-ap')


def _hex(c):
    return '#%06x' % c


class SpreadBuilder:
    def __init__(self, pdf_path, placements, img_url, used):
        self.doc = pymupdf.open(pdf_path)
        self.by_xref = {}
        for p in placements:
            self.by_xref.setdefault(p['xref'], p)
        self.img_url = img_url      # hàm: tên file ảnh -> URL (tuỳ bản web / artifact / WordPress)
        self.used = used            # tập file ảnh đã dùng (để chép đi)

    # ------------------------------------------------------------------
    def spread(self, pno):
        page = self.doc[pno]
        W, H = page.rect.width, page.rect.height
        half_w = W / 2
        X = lambda v: round(v / W * 100, 3)      # % theo chiều ngang
        Y = lambda v: round(v / H * 100, 3)      # % theo chiều dọc
        C = lambda v: round(v / W * 100, 4)      # cqw (cỡ chữ, chiều cao dòng)
        items = []   # (nửa trang, y, html)

        # mảng màu lớn (nền trang mở chương...)
        for d in page.get_drawings():
            fill, r = d.get('fill'), d['rect']
            if not fill or r.width * r.height < 0.01 * W * H:
                continue
            if min(fill) > 0.97:   # nền trắng = giấy, bỏ
                continue
            rgb = '#%02x%02x%02x' % tuple(round(c * 255) for c in fill)
            op = d.get('fill_opacity', 1) or 1
            items.append((0, -1, f'<div class="sp-el sp-fill" style="--x:{X(r.x0)};--y:{Y(r.y0)};--w:{X(r.width)};'
                                 f'--h:{Y(r.height)};background:{rgb};opacity:{op:.3f}"></div>'))

        # ảnh (thứ tự vẽ trong PDF = thứ tự chồng lớp)
        for z, info in enumerate(page.get_image_info(xrefs=True)):
            p = self.by_xref.get(info['xref'])
            if not p or not p.get('pageimg'):
                continue
            x0, y0, x1, y1 = info['bbox']
            a, b, c, d, *_ = info['transform']
            flip = []
            if a < 0:
                flip.append('scaleX(-1)')
            if d < 0:
                flip.append('scaleY(-1)')
            fn, iw, ih = p['pageimg']
            self.used.add(fn)
            tf = f' style="transform:{" ".join(flip)}"' if flip else ''
            half = 0 if (x0 + x1) / 2 < half_w else 1
            # loại ảnh cho chuyển động ở chế độ Đọc: ảnh tách nền nổi theo chuột, ảnh lớn phóng chậm
            kind = ' cut' if p.get('kind') == 'cutout' else (' big' if (x1 - x0) * (y1 - y0) > 0.15 * half_w * H else '')
            # bản đồ chuyển động (tools/motion_maps.py): ảnh "sống" nhẹ ở chế độ Đọc
            motion = ''
            at = MOTION_ATLAS.get(os.path.basename(fn)) if kind == ' big' else None
            if at:   # [file atlas, y, cao, cao atlas]: vùng bản đồ của ảnh này trong atlas
                self.used.add('motion/' + at[0])
                motion = f' data-motion="{self.img_url("motion/" + at[0])}" data-mrect="{at[1] / at[3]:.5f},{at[2] / at[3]:.5f}"'
            items.append((half, y0, f'<div class="sp-el sp-img{kind}"{motion} style="--x:{X(x0)};--y:{Y(y0)};--w:{X(x1 - x0)};'
                                    f'--h:{Y(y1 - y0)};z-index:{z + 1}"><img src="{self.img_url(fn)}" width="{iw}" '
                                    f'height="{ih}" alt="" loading="lazy" decoding="async"{tf}></div>'))

        # chữ: từng dòng đúng vị trí; trên điện thoại các dòng nối lại thành đoạn
        for blk in page.get_text('dict')['blocks']:
            if blk.get('type') != 0:
                continue
            lines = [l for l in blk['lines'] if ''.join(s['text'] for s in l['spans']).strip()
                     and abs(l['dir'][0] - 1) < 0.01]
            if not lines:
                continue
            bx0 = min(l['bbox'][0] for l in lines)
            bx1 = max(l['bbox'][2] for l in lines)
            bw = bx1 - bx0
            out = []
            for i, l in enumerate(lines):
                x0, y0, x1, y1 = l['bbox']
                spans = [s for s in l['spans'] if s['text']]
                main = max(spans, key=lambda s: len(s['text']))
                size = main['size']
                nxt = lines[i + 1] if i + 1 < len(lines) else None
                full = (x1 - x0) >= 0.96 * bw
                cont = nxt is not None and abs(nxt['bbox'][0] - x0) < 3 and full
                cls = ['sp-ln', _font_class(main['font'])]
                if cont:
                    cls.append('j')         # dòng giữa đoạn: căn đều hai bên như bản in
                else:
                    cls.append('pe')        # cuối đoạn (xuống dòng khi đọc trên điện thoại)
                if main['flags'] & 2:
                    cls.append('it')
                if main['flags'] & 16:
                    cls.append('bd')
                parts = []
                for s in spans:
                    t = html.escape(s['text'])
                    st = []
                    if abs(s['size'] - size) > 0.3:
                        st.append(f'font-size:{C(s["size"])}cqw')
                    if s['color'] != main['color']:
                        st.append(f'color:{_hex(s["color"])}')
                    sc = []
                    if _font_class(s['font']) != _font_class(main['font']):
                        sc.append(_font_class(s['font']))
                    if (s['flags'] & 2) != (main['flags'] & 2):
                        sc.append('it' if s['flags'] & 2 else 'nit')
                    if st or sc:
                        t = f'<span class="{" ".join(sc)}" style="{";".join(st)}">{t}</span>'
                    parts.append(t)
                color = '' if main['color'] in (0, 0x231f20, 0x1d1d1b) else f';color:{_hex(main["color"])}'
                out.append(f'<span class="{" ".join(cls)}" style="--x:{X(x0)};--y:{Y(y0)};--w:{X(x1 - x0)};'
                           f'--h:{Y(y1 - y0)};--s:{C(size)};--lh:{C(y1 - y0)}{color}">{"".join(parts)} </span>')
            bx = blk['bbox']
            half = 0 if (bx[0] + bx[2]) / 2 < half_w else 1
            items.append((half, bx[1], f'<div class="sp-blk">{"".join(out)}</div>'))

        # thứ tự trong HTML: trang trái rồi trang phải, trên xuống dưới (thứ tự đọc trên điện thoại)
        items.sort(key=lambda t: (t[0], t[1]))
        body, cur = [], 0
        for half, _, h in items:
            if half != cur:
                body.append('<div class="sp-break"></div>')
                cur = half
            body.append(h)
        return (f'<section class="spread" data-page="{pno + 1}" style="--ar:{W:.2f}/{H:.2f}">'
                + ''.join(body) + '</section>')

    def chapter(self, first_page, last_page):
        return '\n'.join(self.spread(p) for p in range(first_page, last_page + 1))
