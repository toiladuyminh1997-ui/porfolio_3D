"""Dựng trang web tĩnh của sách từ các file chương .docx + manifest ảnh.

    python tools/extract_book.py   # (khi dàn trang có ảnh mới)
    python tools/build.py          # tạo lại site/
    python -m http.server 8000 -d site   # xem thử: http://localhost:8000

Thêm chương mới: thêm một dòng vào tools/chapters.json rồi chạy lại build.
"""
import html, json, os, re, shutil, unicodedata
import docx

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.dirname(HERE)
SITE = os.path.join(WEB, 'site')
CFG = json.load(open(os.path.join(HERE, 'chapters.json'), encoding='utf8'))
BOOK = CFG['book']
MANIFEST = os.path.join(HERE, '.cache', 'manifest.json')
# 'web' = site/ cho hosting thường (URL gọn /chuong/1/);
# 'artifact' = artifact/ để đăng lên claude.ai (đường dẫn tương đối, mỗi ảnh một cỡ)
TARGET = 'web'
OUT = SITE
USED = set()
ART_MAX_W = 1600


def u_img(f):
    if TARGET == 'wp':   # công cụ "Nhập sách" của theme thay bằng địa chỉ ảnh trong Thư viện Media
        return '{{img:%s}}' % f
    return ('/img/' if TARGET == 'web' else 'img/') + f


def u_ch(n):
    return f'/chuong/{n}/' if TARGET == 'web' else f'chuong-{n}.html'


def u_home(anchor=''):
    return '/' + anchor if TARGET == 'web' else 'index.html' + anchor


def u_asset(f):
    return ('/assets/' if TARGET == 'web' else 'assets/') + f


def u_model(f):
    return ('/models/' if TARGET == 'web' else 'models/') + f


def model_file(light=False):
    """Mô hình lợn rừng; light = bản nhẹ cho điện thoại (boar-m)."""
    name = 'boar-m' if light else 'boar'
    return name + ('.wasm' if TARGET == 'artifact' else '.glb')


# Literata không kèm trục opsz: file chữ nhẹ hơn nhiều, nhìn gần như nhau ở cỡ chữ đọc
FONTS = ('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400'
         '&family=Literata:ital,wght@0,400;0,600;1,400'
         '&family=Lora:ital,wght@0,400;1,400&family=Roboto+Flex:wght@400'
         '&family=Be+Vietnam+Pro:wght@300;400;500&display=swap&subset=vietnamese')


# ------------------------------------------------------------------ text
def norm(s):
    s = unicodedata.normalize('NFC', s).lower()
    return re.sub(r'[\W_]+', '', s)


def smart(s):
    s = s.replace('...', '…')
    out, open_q = [], True
    for ch in s:
        if ch == '"':
            out.append('“' if open_q else '”')
            open_q = not open_q
        else:
            out.append(ch)
    s = ''.join(out)
    return s.replace("'", '’')


def para_html(p, bold_ok):
    parts = []
    for r in p.runs:
        t = html.escape(r.text)
        if not t:
            continue
        if r.italic:
            t = f'<em>{t}</em>'
        if bold_ok and r.bold:
            t = f'<strong>{t}</strong>'
        parts.append(t)
    s = ''.join(parts).replace('</em><em>', '').replace('</strong><strong>', '')
    return smart(re.sub(r'\s+', ' ', s).strip())


def read_chapter(ch):
    path = os.path.normpath(os.path.join(WEB, BOOK['docx_pattern'].format(n=ch['n'])))
    d = docx.Document(path)
    paras = [p for p in d.paragraphs if p.text.strip()]
    # bỏ các dòng tiêu đề lặp lại ở đầu file
    heads = {norm(x) for x in (BOOK['title'], BOOK['title_en'], '(Full Edition)', ch['title'], ch['title_en'])}
    while paras and (norm(paras[0].text) in heads or norm(paras[0].text).startswith(norm(ch['label']))
                     or norm(paras[0].text) in {norm(f'({ch["title_en"]})')} or
                     re.match(r'^(chương\s*\d+|prologue)\b', paras[0].text.strip(), re.I)):
        paras.pop(0)
    full_bold = sum(1 for p in paras if p.runs and all(r.bold for r in p.runs if r.text.strip()))
    bold_ok = full_bold < 0.2 * max(1, len(paras))
    out = []
    for p in paras:
        t = p.text.strip()
        if re.fullmatch(r'[\*\s~•⁂—–\-#◆◇❖✦]+', t):
            out.append({'hr': True, 'n': ''})
        else:
            out.append({'html': para_html(p, bold_ok), 'n': norm(t)})
    words = sum(len(p.text.split()) for p in paras)
    return out, words


# ------------------------------------------------------------------ images
PDF_SEQ = None
PAGE_W = 907.0   # một trang đơn trong file dàn trang (spread = 2 trang)


def pdf_sequence():
    """Thứ tự đọc của bản dàn trang: khối chữ và ảnh theo (trang, nửa trái/phải, y)."""
    global PDF_SEQ
    if PDF_SEQ is None:
        import pymupdf
        doc = pymupdf.open(os.path.normpath(os.path.join(WEB, BOOK['pdf'])))
        seq = []
        for pno, page in enumerate(doc):
            for x0, y0, x1, y1, text, _, typ in page.get_text('blocks'):
                t = norm(text)
                if typ == 0 and len(t) >= 6:
                    seq.append(((pno, 0 if (x0 + x1) / 2 < PAGE_W else 1, y0), 'text', t))
            for info in page.get_image_info(xrefs=True):
                if info['xref']:
                    r = info['bbox']
                    seq.append(((pno, 0 if (r[0] + r[2]) / 2 < PAGE_W else 1, (r[1] + r[3]) / 2), 'img', info['xref']))
        seq.sort(key=lambda s: s[0])
        PDF_SEQ = seq
    return PDF_SEQ


def place_images(ch, paras, placements, anchors=None):
    """Xếp ảnh đúng như bản dàn trang. Dò toàn bộ chữ của PDF với chữ trong .docx theo thứ tự
    (chỉ tiến, không lùi), nên mỗi ảnh nằm ngay sau đoạn chữ đứng trước nó trên trang/nửa trang.
    Trả về {chỉ số đoạn: [ảnh...]} (chèn SAU đoạn đó; -1 = trước đoạn đầu).
    anchors (list): nếu có, ghi thêm (vị trí trong chữ .docx, trang PDF) của từng khối chữ dò được."""
    by_xref = {}
    for p in placements:
        if p.get('chapter') == ch['n'] and p['kind'] != 'ornament':
            by_xref.setdefault(p['xref'], p)
    pages = range(ch['page'], next((c['page'] for c in CFG['chapters'] if c['page'] > ch['page']), 10 ** 6))
    seq = [s for s in pdf_sequence() if s[0][0] in pages]

    starts, buf = [], ''
    for p in paras:
        starts.append(len(buf))
        buf += p['n']
    import bisect

    def para_at(pos):
        return max(0, bisect.bisect_right(starts, pos) - 1)

    out, uniq, misses = {}, [], 0
    cursor, last_end, placed = 0, None, set()
    for key, kind, val in seq:
        if kind == 'text':
            head = val[:40]
            pos = buf.find(head, cursor, cursor + 30000) if len(head) >= 12 else -1
            if pos < 0 and len(val) >= 30:          # đầu khối bị sửa: thử bằng đuôi khối
                tail = val[-30:]
                p2 = buf.find(tail, cursor, cursor + 30000)
                pos = p2 - (len(val) - 30) if p2 >= 0 else -1
            if pos < 0:
                continue                             # tiêu đề / chữ trang trí không có trong .docx
            end = pos + len(val)
            tail = val[-24:]
            p3 = buf.find(tail, max(pos, end - len(val) // 2 - 200), end + 400)
            if p3 >= 0:
                end = p3 + len(tail)
            cursor = max(cursor, pos + len(head))
            last_end = max(last_end or 0, min(end, len(buf)))
            if anchors is not None:
                anchors.append((pos, key[0]))
        else:
            im = by_xref.get(val)
            if im is None or val in placed:
                continue
            placed.add(val)
            uniq.append(im)
            idx = -1 if last_end is None else para_at(last_end - 1)
            if last_end is None and im['page'] > ch['page'] + 1:
                misses += 1
            out.setdefault(idx, []).append(im)
    return out, uniq, misses


def img_files(im):
    if TARGET == 'web':
        return im['files']
    # gói một cỡ ảnh: nếu ảnh trang dàn trang chính là ảnh gốc (không bị cắt khung) thì dùng chung file đó
    pi = im.get('pageimg')
    if pi and im['files'] and im['kind'] == 'full':   # (ảnh tách nền giữ bản đã xoá nền trắng)
        f, w, h = im['files'][-1]
        if abs(pi[1] / pi[2] - w / h) < .03 * w / h:
            return [tuple(pi)]
    one = [f for f in im['files'] if f[1] <= ART_MAX_W] or im['files'][:1]
    return one[-1:]


def img_src(im, i=0):
    fs = img_files(im)
    f = fs[min(i, len(fs) - 1)][0]
    USED.add(f)
    return u_img(f)


def img_tag(im, sizes, cls='', eager=False):
    fs = img_files(im)
    f, w, h = fs[-1]
    for x in fs:
        USED.add(x[0])
    srcset = ', '.join(f'{u_img(x[0])} {x[1]}w' for x in fs)
    return (f'<img class="{cls}" src="{u_img(fs[0][0])}" srcset="{srcset}" sizes="{sizes}" '
            f'width="{w}" height="{h}" alt="" decoding="async" '
            f'{"fetchpriority=high" if eager else "loading=lazy"} style="background:{im["avg"]}">')


def figure(im, side):
    k = im['kind']
    if k == 'full':
        return f'<figure class="fig fig-full" data-reveal>{img_tag(im, "100vw")}</figure>'
    if k == 'cutout':
        return f'<figure class="fig fig-cutout fig-{side}" data-reveal>{img_tag(im, "(max-width: 700px) 70vw, 420px")}</figure>'
    return f'<figure class="fig fig-inline" data-reveal>{img_tag(im, "(max-width: 900px) 100vw, 860px")}</figure>'


# ------------------------------------------------------------------ pages
def page(title, body, cls, extra_head='', scripts='', bare=False):
    """bare=True: trang chính của Artifact — nền tảng tự bọc doctype/head/body."""
    if bare:
        return f'''<title>{html.escape(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="{FONTS}">
<link rel="stylesheet" href="{u_asset('style.css')}">
{extra_head}
<script>document.documentElement.lang = 'vi'; document.body && (document.body.className = '{cls}');</script>
{body}
{scripts}
'''
    return f'''<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(BOOK['title'])} — {html.escape(BOOK['title_en'])}. Tiểu thuyết giả tưởng minh hoạ 3D.">
<meta name="theme-color" content="#0b0d12">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%230b0d12'/%3E%3Ctext x='16' y='23' font-size='20' text-anchor='middle' fill='%23c9b48a' font-family='serif'%3E%E2%9C%A6%3C/text%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="{FONTS}">
<link rel="stylesheet" href="{u_asset('style.css')}">
{extra_head}
</head>
<body class="{cls}">
{body}
{scripts}
</body>
</html>
'''


def chapter_content(ch, placements):
    """Nội dung một chương: (danh sách khối HTML, ảnh bìa, số chữ, số ảnh, số ảnh không neo được)."""
    paras, words = read_chapter(ch)
    by_idx, imgs, misses = place_images(ch, paras, placements)
    hero = next((i for i in imgs if i['kind'] == 'full'), None)
    flow = []
    side = 0
    for im in by_idx.get(-1, []):
        if im is not hero:
            flow.append(figure(im, 'r'))
    for i, p in enumerate(paras):
        if p.get('hr'):
            flow.append('<hr class="scene">')
        else:
            first = ' class="first"' if i == 0 else ''
            flow.append(f'<p{first}>{p["html"]}</p>')
        for im in by_idx.get(i, []):
            if im is hero:
                continue
            side ^= 1
            flow.append(figure(im, 'l' if side else 'r'))
    return flow, hero, words, imgs, misses


SPREADS = None   # SpreadBuilder (tools/spreads.py), tạo trong main


def chapter_pages(ch):
    """Các trang (trang đôi) của chương trong PDF: từ trang tiêu đề tới trước chương sau."""
    nxt = [c['page'] for c in CFG['chapters'] if c['page'] > ch['page']]
    last = (min(nxt) - 1) if nxt else SPREADS.doc.page_count - 1
    return ch['page'], last


def chapter_spreads(ch):
    return SPREADS.chapter(*chapter_pages(ch))


def get_spreads(placements):
    global SPREADS
    if SPREADS is None:
        from spreads import SpreadBuilder
        SPREADS = SpreadBuilder(os.path.normpath(os.path.join(WEB, BOOK['pdf'])), placements, u_img, USED)
    return SPREADS


# ------------------------------------------------------------------ hai cách đọc
# "Đọc": cuộn kiểu phim — mỗi trang đôi là một cảnh, ảnh lớn của trang phủ kín màn hình làm nền,
#        chữ của chính trang đó (lấy từ .docx) trượt lên trong khung mờ, nhân vật tách nền nổi bên cạnh.
# "Dàn trang": lật từng trang đôi dựng lại đúng bản InDesign (tools/spreads.py).
def page_layout(pno):
    """Một trang đôi của PDF: (các ảnh lớn theo diện tích giảm dần, ảnh tách nền, hoa văn nhỏ,
    nửa trang có chữ 'l'/'r')."""
    page = SPREADS.doc[pno]
    W, H = page.rect.width, page.rect.height
    full, cuts, orns, seen = [], [], [], set()
    for info in page.get_image_info(xrefs=True):
        p = SPREADS.by_xref.get(info['xref'])
        if not p or not p.get('files') or info['xref'] in seen:
            continue
        seen.add(info['xref'])
        x0, y0, x1, y1 = info['bbox']
        area = max(0, min(x1, W) - max(x0, 0)) * max(0, min(y1, H) - max(y0, 0))
        if p['kind'] in ('full', 'inline'):
            full.append((area, p))
        elif p['kind'] == 'cutout':
            # ảnh tách nền rất nhỏ (< 8% một trang) là hoa văn trang trí, không phải nhân vật
            (orns if area < .08 * W / 2 * H else cuts).append(p)
    chars = [0, 0]
    for x0, y0, x1, y1, text, _, typ in page.get_text('blocks'):
        if typ == 0:
            chars[0 if (x0 + x1) / 2 < W / 2 else 1] += len(text.strip())
    full.sort(key=lambda t: -t[0])
    return [p for _, p in full], cuts, orns, 'l' if chars[0] >= chars[1] else 'r'


def motion_spreads(p0, p1):
    """"Đọc" trên máy tính: trang đôi chuyển động — mỗi trang đôi đúng bản dàn phủ một màn hình,
    nền là ảnh lớn của chính trang đó làm mờ. reader.js nhân bản trang đôi từ <template id="bv-tpl">
    khi sắp cuộn tới, rồi thêm chuyển động (ảnh phóng chậm, nhân vật nổi theo chuột, chữ hiện từng dòng)."""
    out = []
    for pno in range(p0, p1 + 1):
        full = page_layout(pno)[0]
        amb = ''
        if full:
            f = img_files(full[0])[0][0]
            USED.add(f)
            amb = f' data-amb="{u_img(f)}"'
        r = SPREADS.doc[pno].rect
        out.append(f'<section class="mv" data-page="{pno + 1}" style="--ar:{r.width:.2f}/{r.height:.2f}"{amb}>'
                   f'<div class="mv-amb"></div><div class="mv-sp"></div></section>')
    return f'<main class="mvs" id="mvs">{"".join(out)}</main>'


def para_pages(ch, paras, placements):
    """Trang đôi (chỉ số trang PDF) nơi mỗi đoạn .docx bắt đầu — cùng phép dò chữ với place_images."""
    import bisect
    anchors = []
    place_images(ch, paras, placements, anchors)
    anchors.sort()
    apos = [a[0] for a in anchors]
    p0, p1 = chapter_pages(ch)
    out, pos, last = [], 0, p0
    for p in paras:
        i = bisect.bisect_right(apos, pos) - 1
        pno = anchors[i][1] if i >= 0 else p0
        last = max(last, min(max(pno, p0), p1))     # không lùi trang
        out.append(last)
        pos += len(p['n'])
    return out


def bg_tag(im):
    """Ảnh của cảnh (khung ảnh đứng yên): tải trễ bằng JS (data-src) vì cả lớp ảnh nằm cố định trong khung nhìn.
    .amb = cùng ảnh, cỡ nhỏ nhất, làm mờ để lấp phần trống quanh ảnh chính (ảnh chính hiện trọn, không cắt)."""
    fs = img_files(im)
    for x in fs:
        USED.add(x[0])
    f, w, h = fs[-1]
    srcset = ', '.join(f'{u_img(x[0])} {x[1]}w' for x in fs)
    return (f'<div class="cbg" style="background:{im["avg"]}"><img class="amb" data-src="{u_img(fs[0][0])}" alt="">'
            f'<img class="main" data-src="{u_img(f)}" data-srcset="{srcset}" '
            f'sizes="(orientation: portrait) 100vw, 56vw" width="{w}" height="{h}" alt="" decoding="async"></div>')


def cut_tag(im):
    return f'<figure class="cs-cut">{img_tag(im, "(max-width: 1000px) 46vw, 26rem")}</figure>'


def chapter_reader(ch, placements, words):
    """HTML của cả hai cách đọc cho một chương (dùng chung cho bản web, Artifact và WordPress)."""
    paras, _ = read_chapter(ch)
    pages = para_pages(ch, paras, placements)
    p0, p1 = chapter_pages(ch)
    by_page = {}
    for p, pno in zip(paras, pages):
        by_page.setdefault(pno, []).append(p)
    bgs, scenes, first = [], [], True

    def bg_index(im):
        for i, b in enumerate(bgs):
            if b is im:
                return i
        bgs.append(im)
        return len(bgs) - 1

    for pno in range(p0, p1 + 1):
        full, cuts, orns, side = page_layout(pno)
        ps = by_page.get(pno, [])
        if not full and not ps and not cuts:
            continue
        bi = bg_index(full[0]) if full else -1
        cls = ['cs', 'side-' + side]
        if bi < 0:
            cls.append('nobg')
        if not ps:
            cls.append('solo')
        h = [f'<section class="{" ".join(cls)}" data-bg="{bi}" data-page="{pno + 1}">',
             f'<div class="cs-head"><span>Trang đôi {pno - p0 + 1}</span>'
             f'<button class="cs-pg" data-goto="{pno + 1}">Xem bản dàn trang</button></div>']
        if not ps and not cuts:   # trang chỉ có hình: chừa khoảng cuộn để người đọc ngắm ảnh bên cạnh
            h.append('<div class="cs-solo">Hình minh hoạ</div>')
        gallery = cuts if (len(cuts) > 2 or bi < 0 or not ps) else []
        if gallery:
            h.append('<div class="cs-cuts">' + ''.join(cut_tag(c) for c in gallery) + '</div>')
        if ps:
            h.append('<div class="cs-text" data-reveal>')
            if orns:
                h.append(f'<div class="cs-orn">{img_tag(orns[0], "10rem")}</div>')
            if not gallery:
                h.extend(cut_tag(c) for c in cuts)
            h.extend(f'<figure class="cs-fig">{img_tag(im, "(max-width: 700px) 100vw, 38rem")}</figure>' for im in full[1:])
            for p in ps:
                if p.get('hr'):
                    h.append('<hr class="scene">')
                else:
                    h.append(('<p class="first">' if first else '<p>') + p['html'] + '</p>')
                    first = False
            h.append('</div>')
        h.append('</section>')
        scenes.append(''.join(h))
    if scenes:   # dấu kết chương trong khung chữ cuối
        k = scenes[-1].rfind('</div></section>')
        if k >= 0:
            scenes[-1] = scenes[-1][:k] + '<div class="end-mark">✦</div>' + scenes[-1][k:]

    mins = max(1, round(words / 200))
    open_bg = 0 if bgs else -1   # mở chương trên ảnh lớn đầu tiên của chương
    letters = ' '.join('<span class="word">' + ''.join(
        f'<span class="ch" style="--i:{i}">{html.escape(c)}</span>' for i, c in enumerate(w)) + '</span>'
        for w in unicodedata.normalize('NFC', ch['title']).split())
    opener = (f'<section class="cs cs-open side-l" data-bg="{open_bg}" data-page="{p0 + 1}">'
              f'<div class="cs-open-text"><div class="ch-label">{ch["label"]}</div>'
              f'<h1 class="ch-title">{letters}</h1><div class="ch-en">{html.escape(ch["title_en"])}</div>'
              f'<div class="ch-meta">{mins} phút đọc · {p1 - p0 + 1} trang đôi</div></div>'
              f'<div class="scroll-cue">Cuộn để đọc</div></section>')
    # điện thoại / màn dọc: ảnh đứng yên trên + chữ chảy (.cine); máy tính: trang đôi chuyển động (.mvs)
    cine = (f'<div class="cine-bg" aria-hidden="true">{"".join(bg_tag(b) for b in bgs)}</div>'
            f'<main class="cine" id="prose">{opener}{"".join(scenes)}</main>' + motion_spreads(p0, p1))
    # bản dàn trang nằm trong <template>: trình duyệt không dựng hàng nghìn phần tử này
    # cho tới khi người đọc bấm "Dàn trang" (reader.js lấy ra lúc đó)
    book = (f'<div class="book" id="book" hidden><div class="bv-stage" id="bv-stage"></div>'
            f'<template id="bv-tpl">{SPREADS.chapter(p0, p1)}</template>'
            '<button class="bv-nav bv-prev" aria-label="Trang trước">‹</button>'
            '<button class="bv-nav bv-next" aria-label="Trang sau">›</button>'
            '<div class="bv-foot"><span id="bv-count"></span><input type="range" id="bv-range" min="0" value="0" '
            'aria-label="Chọn trang"><button id="bv-zoom">Phóng to</button></div></div>')
    return cine + '\n' + book


MODE_SWITCH = ('<div class="mode" role="group" aria-label="Cách đọc"><button data-mode="read" class="on">Đọc</button>'
               '<button data-mode="book">Dàn trang</button></div>')


def build_chapter(ch, prev, nxt, placements):
    paras, words = read_chapter(ch)
    by_idx, imgs, misses = place_images(ch, paras, placements)
    hero = next((i for i in imgs if i['kind'] == 'full'), None)
    mins = max(1, round(words / 200))
    nav = '<nav class="ch-nav">'
    nav += (f'<a class="prev" href="{u_ch(prev["n"])}"><span>← {prev["label"]}</span>{prev["title"]}</a>'
            if prev else '<span></span>')
    nav += (f'<a class="next" href="{u_ch(nxt["n"])}"><span>{nxt["label"]} →</span>{nxt["title"]}</a>'
            if nxt else f'<a class="next" href="{u_home("#muc-luc")}"><span>Hết phần đã đăng</span>Quay về mục lục</a>')
    nav += '</nav>'
    body = f'''
<div class="progress"><i></i></div>
<header class="bar">
  <a class="bar-home" href="{u_home('#muc-luc')}" aria-label="Mục lục">☰ <span>Mục lục</span></a>
  <div class="bar-title">{ch['label']} · {html.escape(ch['title'])}</div>
  <div class="bar-r">{MODE_SWITCH}<button class="bar-btn" id="settings-btn" aria-label="Tuỳ chỉnh chữ">Aa</button></div>
</header>
<div class="settings" id="settings" hidden>
  <div class="row"><span>Cỡ chữ</span><button data-size="-1">A−</button><button data-size="1">A+</button></div>
  <div class="row"><span>Nền</span><button data-theme="night">Đêm</button><button data-theme="paper">Giấy</button></div>
</div>
{chapter_reader(ch, placements, words)}
{nav}
<div class="resume" id="resume" hidden><span>Đọc tiếp từ chỗ bạn dừng lại?</span><button id="resume-yes">Đọc tiếp</button><button id="resume-no" aria-label="Đóng">✕</button></div>
'''
    style = f'<style>:root{{--ch-bg:{ch["bg"]};--accent:{ch["accent"]}}}</style>'
    if nxt:   # tải trước chương sau khi trình duyệt rảnh -> bấm "Chương sau" mở ngay
        style += f'<link rel="prefetch" href="{u_ch(nxt["n"])}">'
    out = page(f'{ch["label"]}: {ch["title"]} — {BOOK["title"]}', body, 'reader',
               style, f'<script>window.CHAPTER={ch["n"]};</script><script src="{u_asset("reader.js")}" defer></script>')
    if TARGET == 'web':
        d = os.path.join(OUT, 'chuong', str(ch['n']))
        os.makedirs(d, exist_ok=True)
        path = os.path.join(d, 'index.html')
    else:
        path = os.path.join(OUT, u_ch(ch['n']))
    open(path, 'w', encoding='utf8').write(out)
    return {'words': words, 'mins': mins, 'hero': hero, 'imgs': len(imgs), 'misses': misses}


def build_index(chapters, info, placements):
    front = [p for p in placements if p.get('chapter') is None and p['kind'] in ('full', 'inline')]
    cover = front[0] if front else info[chapters[0]['n']]['hero']
    rows = []
    for ch in chapters:
        h = info[ch['n']]['hero']
        thumb = img_src(h, 1) if h else ''
        rows.append(f'''<a class="toc-row" href="{u_ch(ch['n'])}" data-bg="{ch['bg']}" data-accent="{ch['accent']}" data-img="{thumb}">
  <span class="toc-n">{ch['label']}</span>
  <span class="toc-t">{html.escape(ch['title'])}<em>{html.escape(ch['title_en'])}</em></span>
  <span class="toc-m">{info[ch['n']]['mins']} phút</span>
  {f'<img class="toc-thumb" src="{thumb}" alt="" loading="lazy">' if thumb else ''}
</a>''')
    for up in CFG.get('upcoming', []):
        rows.append(f'''<div class="toc-row toc-soon"><span class="toc-n">{up['label']}</span>
  <span class="toc-t">{html.escape(up['title'])}</span><span class="toc-m">Sắp ra mắt</span></div>''')
    words = sum(i['words'] for i in info.values())
    title_letters = ' '.join('<span class="word">' + ''.join(f'<span class="ch">{html.escape(c)}</span>' for c in w)
                             + '</span>' for w in unicodedata.normalize('NFC', BOOK['title']).split())
    tagline = ' '.join(f'<span class="w">{html.escape(w)}</span>' for w in BOOK['tagline'].split())
    body = body_index(chapters, info, cover, rows, words, title_letters, tagline)
    scripts = ('<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>'
               '<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js"></script>'
               '<script src="https://unpkg.com/lenis@1.1.13/dist/lenis.min.js"></script>'
               f'<script>window.CH_URL = {json.dumps(u_ch("{n}"))}; window.MODEL_URL = {json.dumps(u_model(model_file()))}; '
               f'window.MODEL_URL_M = {json.dumps(u_model(model_file(True)))};</script>'
               f'<script src="{u_asset("home.js")}" defer></script>')
    mode = hero_mode()
    if mode in ('3d', 'boar'):
        # three.js (0.160.0) đi kèm trang trong assets/vendor — không phụ thuộc CDN bên ngoài
        rel = '' if TARGET == 'web' else './'   # importmap cần ./ hoặc / ở đầu đường dẫn
        imports = {'three': rel + u_asset('vendor/three/build/three.module.min.js'),
                   'three/addons/': rel + u_asset('vendor/three/examples/jsm/')}
        scripts += (f'<script type="importmap">{json.dumps({"imports": imports})}</script>'
                    f'<link rel="modulepreload" href="{imports["three"]}">'
                    f'<script type="module" src="{u_asset("hero3d.js" if mode == "3d" else "hero-boar.js")}"></script>')
    title = BOOK['title'] if TARGET == 'artifact' else f'{BOOK["title"]} — {BOOK["title_en"]}'
    cls = {'3d': 'home home-3d', 'boar': 'home home-boar'}.get(mode, 'home')
    open(os.path.join(OUT, 'index.html'), 'w', encoding='utf8').write(
        page(title, body, cls, '', scripts, bare=TARGET == 'artifact'))


def hero_mode():
    """'image' = ảnh bìa + sương; 'boar' = đầu lợn 3D trên nền đen; '3d' = đầu lợn + đàn quạ (bản thử 1)."""
    return BOOK.get('hero', 'image')


def hero_3d():
    return hero_mode() == '3d'


def hero_html(cover, title_letters):
    img = f'<div class="hero-img">{img_tag(cover, "100vw", eager=True) if cover else ""}</div>'
    # ẩn tiêu đề tới khi phông tải xong (home.js thêm .fonts-ok; tự hiện sau 2,5s nếu script lỗi)
    img = ("<script>document.documentElement.classList.add('wf');"
           "setTimeout(function(){document.documentElement.classList.add('fonts-ok')},2500)</script>") + img
    kicker = '<div class="hero-kicker">Tiểu thuyết giả tưởng · Minh hoạ 3D</div>'
    title = (f'<h1 class="hero-title">{title_letters}</h1>'
             f'<div class="hero-en">{html.escape(BOOK["title_en"])}</div>')
    cue = '<div class="scroll-cue">Cuộn để bước vào</div>'
    if hero_mode() == 'boar':   # kiểu Dogstudio: lợn rừng 3D cố định suốt trang, đổi góc máy theo phần (hero-boar.js)
        n = len([c for c in CFG['chapters'] if c.get('published')])
        intro = (f'<p class="hero-intro">Một tiểu thuyết giả tưởng phương Bắc, minh hoạ hoàn toàn bằng 3D. '
                 f'{n} chương đầu đã có thể đọc trực tuyến.</p>')
        return (f'<div class="aurora" aria-hidden="true"></div>'
                f'<canvas id="boar" aria-label="Lợn rừng 3D"></canvas>'
                f'<section class="hero" id="hero">{img}'
                f'<div class="hero-text">{kicker}{title}</div>{intro}{cue}</section>')
    if hero_3d():   # đầu lợn 3D + đàn quạ (hero3d.js)
        return (f'<div class="haze" aria-hidden="true"></div><canvas id="scene" aria-hidden="true"></canvas>\n'
                f'<section class="hero" id="hero">{img}{kicker}<div class="hero-text">{title}</div>{cue}</section>')
    # ảnh bìa + sương trôi
    return (f'<section class="hero" id="hero">{img}<canvas id="fog"></canvas>'
            f'<div class="hero-text">{kicker}{title}</div>{cue}</section>')


def body_index(chapters, info, cover, rows, words, title_letters, tagline):
    words_s = f'{words:,}'.replace(',', '.')
    return f'''
<div class="cursor-img" id="cursor-img"><img alt=""></div>
<header class="bar bar-home-page">
  <a class="brand" href="{u_home()}">{html.escape(BOOK['title_en'])}</a>
  <nav><a href="#muc-luc">Mục lục</a><a href="#" id="continue-link" hidden>Đọc tiếp</a></nav>
</header>
{hero_html(cover, title_letters)}
<section class="quote">
  <p class="quote-text">{tagline}</p>
  <a class="btn" href="{u_ch(chapters[0]['n'])}">Bắt đầu đọc</a>
</section>
<section class="toc" id="muc-luc">
  <div class="toc-head"><h2>Mục lục</h2><span>{len(chapters)} chương · {words_s} chữ</span></div>
  <div class="toc-list">
  {chr(10).join(rows)}
  </div>
</section>
<footer class="foot">
  <div>{html.escape(BOOK['title'])}</div>
  <div class="foot-sub">Mọi hình minh hoạ được dựng bằng 3D · Sách đang được viết tiếp</div>
</footer>
'''


PAGE_MAX_W = 1800   # ảnh trang dàn trang khi đóng gói WordPress / Artifact (bản web giữ nguyên tới 2400px)


def copy_img(f, dst):
    """Chép ảnh đã dùng sang gói đích; ảnh trang dàn trang rộng quá PAGE_MAX_W thì thu nhỏ cho gói nhẹ."""
    src = os.path.join(SITE, 'img', f)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if f.startswith('page/'):
        from PIL import Image
        im = Image.open(src)
        if im.width > PAGE_MAX_W:
            im = im.resize((PAGE_MAX_W, round(im.height * PAGE_MAX_W / im.width)), Image.LANCZOS)
            im.save(dst, 'WEBP', quality=84, method=5)
            return
    shutil.copy2(src, dst)


def main_wp():
    """Theme WordPress: web/wordpress/ga-tho-ren/ (+ .zip). Mã theme ở src/wp-theme/;
    nội dung sách (chương + ảnh) đóng gói trong book/ để công cụ "Nhập sách" đưa vào WordPress."""
    global TARGET, OUT
    TARGET = 'wp'
    root = os.path.join(WEB, 'wordpress')
    OUT = os.path.join(root, 'ga-tho-ren')
    shutil.rmtree(OUT, ignore_errors=True)
    shutil.copytree(os.path.join(WEB, 'src', 'wp-theme'), OUT)
    shutil.copytree(os.path.join(WEB, 'src', 'assets'), os.path.join(OUT, 'assets'),
                    ignore=shutil.ignore_patterns('hero3d.js', 'three.module.js'))
    os.makedirs(os.path.join(OUT, 'models'))
    for name in ('boar.glb', 'boar-m.glb'):
        shutil.copy2(os.path.join(WEB, 'src', 'models', name), os.path.join(OUT, 'models', name))
    placements = json.load(open(MANIFEST, encoding='utf8'))['placements']
    get_spreads(placements)
    book = {k: BOOK[k] for k in ('title', 'title_en', 'tagline')}
    out = []
    for ch in CFG['chapters']:
        paras, words = read_chapter(ch)
        _, imgs, _ = place_images(ch, paras, placements)
        hero = next((i for i in imgs if i['kind'] == 'full'), None)   # ảnh đại diện của chương
        p0, p1 = chapter_pages(ch)
        out.append({
            'n': ch['n'], 'label': ch['label'], 'title': ch['title'], 'title_en': ch['title_en'],
            'bg': ch['bg'], 'accent': ch['accent'], 'published': bool(ch.get('published')),
            'hero': img_files(hero)[-1][0] if hero else None,
            'words': words, 'spreads': p1 - p0 + 1,
            # nội dung = cả hai cách đọc (cuộn kiểu phim + lật trang dàn trang),
            # viết liền một dòng để WordPress không chèn <p>/<br>
            'html': chapter_reader(ch, placements, words).replace('\n', ''),
        })
        if hero:
            USED.add(img_files(hero)[-1][0])
        print(f'{ch["label"]:10s} {words:6d} chữ  {len(imgs):3d} ảnh')
    os.makedirs(os.path.join(OUT, 'book'))
    json.dump({'book': book, 'upcoming': CFG.get('upcoming', []), 'chapters': out},
              open(os.path.join(OUT, 'book', 'chapters.json'), 'w', encoding='utf8'), ensure_ascii=False)
    for f in USED:
        copy_img(f, os.path.join(OUT, 'book', 'img', f))
    # đóng gói zip để tải lên trong WordPress (Giao diện > Theme > Thêm mới > Tải theme lên)
    zpath = shutil.make_archive(os.path.join(root, 'ga-tho-ren'), 'zip', root, 'ga-tho-ren')
    print('ảnh:', len(USED), '| zip:', round(os.path.getsize(zpath) / 1e6, 1), 'MB ->', zpath)


def main():
    global TARGET, OUT
    import sys
    if '--wp' in sys.argv:
        return main_wp()
    if '--artifact' in sys.argv:
        TARGET, OUT = 'artifact', os.path.join(WEB, 'artifact')
        shutil.rmtree(OUT, ignore_errors=True)
    elif '--pages' in sys.argv:
        # GitHub Pages (repo con: https://<user>.github.io/<repo>/): như bản Artifact — đường dẫn tương đối,
        # file phẳng chuong-N.html, một cỡ ảnh — nhưng là trang HTML đầy đủ, mô hình giữ đuôi .glb
        TARGET, OUT = 'pages', os.path.join(WEB, 'docs')
        # giữ các bản cũ (docs/vNN/, ảnh dùng chung ../img) và trang danh sách phiên bản.
        # img/ chỉ thêm, không xoá: tên ảnh theo xref của PDF, PDF xuất lại thì tên đổi -> bản cũ vẫn cần ảnh cũ
        for f in os.listdir(OUT) if os.path.isdir(OUT) else []:
            if re.fullmatch(r'v\d+', f) or f in ('phien-ban.html', 'portfolio', 'img'):   # portfolio: tools/build_portfolio.py
                continue
            p = os.path.join(OUT, f)
            shutil.rmtree(p) if os.path.isdir(p) else os.remove(p)
    placements = json.load(open(MANIFEST, encoding='utf8'))['placements'] if os.path.exists(MANIFEST) else []
    os.makedirs(OUT, exist_ok=True)
    # three.module.js (bản chưa nén, 1,3MB) chỉ để đọc mã; trang dùng three.module.min.js
    shutil.copytree(os.path.join(WEB, 'src', 'assets'), os.path.join(OUT, 'assets'), dirs_exist_ok=True,
                    ignore=shutil.ignore_patterns('three.module.js'))
    shutil.copytree(os.path.join(WEB, 'src', 'models'), os.path.join(OUT, 'models'), dirs_exist_ok=True,
                    ignore=shutil.ignore_patterns('raven.glb'))   # quạ dựng bằng code, không cần file
    if TARGET == 'artifact':
        # claude.ai không phục vụ .glb, và data: URI (glTF JSON nhúng base64) có thể bị CSP chặn.
        # Đổi đuôi thành .wasm (kiểu nhị phân được phục vụ nguyên vẹn); GLTFLoader nhận GLB qua magic bytes.
        for name in ('boar', 'boar-m'):
            glb = os.path.join(OUT, 'models', name + '.glb')
            os.replace(glb, os.path.join(OUT, 'models', name + '.wasm'))
    get_spreads(placements)
    chapters = [c for c in CFG['chapters'] if c.get('published')]
    info = {}
    for i, ch in enumerate(chapters):
        prev = chapters[i - 1] if i else None
        nxt = chapters[i + 1] if i + 1 < len(chapters) else None
        info[ch['n']] = build_chapter(ch, prev, nxt, placements)
        r = info[ch['n']]
        print(f'{ch["label"]:10s} {r["words"]:6d} chữ  {r["imgs"]:3d} ảnh  (neo theo trang: {r["misses"]})')
    build_index(chapters, info, placements)
    if TARGET != 'web':   # chỉ chép những ảnh thật sự dùng
        for f in USED:
            copy_img(f, os.path.join(OUT, 'img', f))
    if TARGET == 'pages':
        open(os.path.join(OUT, '.nojekyll'), 'w').close()   # GitHub Pages phục vụ nguyên file, không qua Jekyll
    missing = set()
    for dp, _, fs in os.walk(OUT):
        for f in fs:
            if f.endswith('.html'):
                for u in re.findall(r'img/[^\s"\']+?\.webp', open(os.path.join(dp, f), encoding='utf8').read()):
                    if not os.path.exists(os.path.join(OUT, u)):
                        missing.add(u)
    if missing:
        print('THIẾU ẢNH:', len(missing), sorted(missing)[:5])
    print('xong ->', OUT)


if __name__ == '__main__':
    main()
