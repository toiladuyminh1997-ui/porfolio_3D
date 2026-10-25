"""Tách ảnh minh hoạ từ bản dàn trang PDF, tìm ảnh gốc độ phân giải cao
(theo link trong file .indd) và xuất WebP cho web.

Chạy lại mỗi khi dàn trang thêm chương:  python tools/extract_book.py
Kết quả: site/img/**.webp + tools/.cache/manifest.json (build.py dùng để chèn ảnh vào chữ)
"""
import json, os, re, sys, hashlib, urllib.parse
import numpy as np, cv2, pymupdf
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.dirname(HERE)
CACHE = os.path.join(HERE, '.cache')
IMG_OUT = os.path.join(WEB, 'site', 'img')
os.makedirs(CACHE, exist_ok=True)

CFG = json.load(open(os.path.join(HERE, 'chapters.json'), encoding='utf8'))
PDF = os.path.normpath(os.path.join(WEB, CFG['book']['pdf']))
INDD = os.path.normpath(os.path.join(WEB, CFG['book']['indd']))

PAGE_W = 907.0        # một trang đơn; spread = 2 x PAGE_W
PAGE_H = 623.6
THUMB = 224           # cạnh dài của ảnh nhỏ dùng để so khớp
MATCH_OK = 0.78
DIFF_MEAN, DIFF_P95 = 14, 45   # sai khác màu tối đa (0-255) để coi ảnh gốc là cùng bản
SIZES = {'full': [960, 1600, 2560], 'inline': [720, 1280], 'cutout': [480, 900]}


# ---------------------------------------------------------------- helpers
def linked_originals():
    if not os.path.exists(INDD):   # không có file .indd: chỉ tìm ảnh gốc trong thư mục bối cảnh (render_pool)
        print('không thấy', INDD, '-> bỏ qua link trong .indd')
        return []
    b = open(INDD, 'rb').read()
    s = set()
    for m in re.finditer(rb'file:(?:///)?([A-Za-z]:/[^\x00"<>|\r\n]{3,240}?\.(?:png|jpe?g|tiff?|webp))', b, re.I):
        p = os.path.normpath(urllib.parse.unquote(m.group(1).decode('utf8', 'replace')))
        if os.path.exists(p):
            s.add(os.path.normcase(p))
    return sorted(s)


def render_pool():
    """Ảnh trong sách thường là bản đã ghép/chỉnh, không phải file đang link,
    nên tìm thêm trong toàn bộ thư mục bối cảnh."""
    root = os.path.dirname(WEB)
    skip = re.compile(r'texture|\\tex\\|hdri|\\textures?\\|\\web\\', re.I)
    out = []
    for d in CFG['book'].get('search_dirs', ['boi canh']):
        for dp, _, fs in os.walk(os.path.join(root, d)):
            for f in fs:
                if f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')):
                    p = os.path.normcase(os.path.join(dp, f))
                    if not skip.search(p) and os.path.getsize(p) > 300_000:
                        out.append(p)
    return out


def previous_outputs():
    """Ảnh gốc đã bị chuyển/xoá khỏi ổ (vd. boi canh/chuong 1-3): dùng lại bản WebP nét cao đã xuất
    lần trước (site/img hoặc docs/img của GitHub Pages) làm ứng viên ảnh gốc.
    Danh sách lấy từ các manifest cũ đã sao lưu: tools/.cache/manifest-*.json."""
    import glob
    root = os.path.dirname(WEB)
    out = set()
    for mf in glob.glob(os.path.join(CACHE, 'manifest-*.json')):
        for x in json.load(open(mf, encoding='utf8'))['placements']:
            src = x.get('source')
            if not src or src == 'pdf' or os.path.exists(os.path.join(root, src)):
                continue
            names = [f[0] for f in x.get('files', [])] + ([x['pageimg'][0]] if x.get('pageimg') else [])
            for base in (IMG_OUT, os.path.join(WEB, 'docs', 'img')):
                found = [os.path.join(base, f) for f in names if os.path.exists(os.path.join(base, f))]
                if found:
                    out.add(os.path.normcase(max(found, key=os.path.getsize)))
                    break
    return sorted(out)


def to_rgb(im, bg=128):
    """PIL image -> RGB, alpha composited on flat grey (cho so khớp)."""
    if im.mode in ('RGBA', 'LA', 'P'):
        im = im.convert('RGBA')
        base = Image.new('RGBA', im.size, (bg, bg, bg, 255))
        return Image.alpha_composite(base, im).convert('RGB')
    return im.convert('RGB')


def gray_small(im, side=THUMB):
    im = to_rgb(im)
    im.thumbnail((side, side), Image.LANCZOS)
    return cv2.cvtColor(np.asarray(im), cv2.COLOR_RGB2GRAY).astype(np.float32)


def _thumb_job(p):
    st = os.stat(p)
    key = hashlib.md5(f'{p}|{st.st_mtime}|{st.st_size}|{THUMB}'.encode()).hexdigest()
    f = os.path.join(CACHE, 'th_' + key + '.npy')
    if os.path.exists(f):
        return p, f
    try:
        with Image.open(p) as im:
            im.draft('RGB', (THUMB * 2, THUMB * 2))
            np.save(f, gray_small(im))
        return p, f
    except Exception as e:
        print('  bỏ qua (không đọc được):', p, e)
        return p, None


def orig_thumbs(paths):
    """Ảnh nhỏ của toàn bộ ảnh gốc, cache theo mtime, chạy song song."""
    from multiprocessing import Pool
    with Pool(max(1, os.cpu_count() - 2)) as pool:
        res = pool.map(_thumb_job, paths, chunksize=4)
    return {p: np.load(f) for p, f in res if f}


def pdf_image(doc, xref, smask):
    pix = pymupdf.Pixmap(doc, xref)
    if pix.colorspace and pix.colorspace.n not in (1, 3):
        pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
    if smask:
        try:
            pix = pymupdf.Pixmap(pix, pymupdf.Pixmap(doc, smask))
        except Exception:
            pass
    mode = {1: 'L', 2: 'LA', 3: 'RGB', 4: 'RGBA'}[pix.n]
    return Image.frombytes(mode, (pix.width, pix.height), pix.samples)


def best_match(E, thumbs):
    """E: ảnh xám nhỏ đã cắt khung trong PDF. Thử: khớp đủ chiều ngang,
    đủ chiều dọc, và vài mức phóng to (khung cắt cả hai chiều)."""
    he, we = E.shape
    best = (0.0, None, None)   # (điểm, đường dẫn, khung khớp theo tỉ lệ ảnh gốc)

    def trial(p, O, tw, th):
        hs, ws = O.shape
        T = cv2.resize(E, (tw, th), interpolation=cv2.INTER_AREA)
        if T.std() < 2:
            return 0.0, None
        r = cv2.matchTemplate(O, T, cv2.TM_CCOEFF_NORMED)
        _, sc, _, (x, y) = cv2.minMaxLoc(np.nan_to_num(r))
        return float(sc), (x / ws, y / hs, tw / ws, th / hs)

    scored = []
    for p, O in thumbs.items():
        hs, ws = O.shape
        top = (0.0, None)
        for fit in ('w', 'h'):
            s = ws / we if fit == 'w' else hs / he
            tw, th = round(we * s), round(he * s)
            if tw > ws + 2 or th > hs + 2:
                continue
            tw, th = min(tw, ws), min(th, hs)
            if tw < 8 or th < 8:
                continue
            top = max(top, trial(p, O, tw, th), key=lambda t: t[0])
        scored.append((top[0], p))
        if top[0] > best[0]:
            best = (top[0], p, top[1])
    if best[0] >= MATCH_OK:
        return best
    # khung cắt phóng to: thử thêm các tỉ lệ nhỏ hơn cho 25 ứng viên tốt nhất
    for _, p in sorted(scored, reverse=True)[:25]:
        O = thumbs[p]
        hs, ws = O.shape
        s0 = min(ws / we, hs / he)
        for k in (0.9, 0.8, 0.7, 0.6, 0.5, 0.4):
            tw, th = round(we * s0 * k), round(he * s0 * k)
            if tw < 16 or th < 16:
                break
            sc, box = trial(p, O, tw, th)
            if sc > best[0]:
                best = (sc, p, box)
    return best


def color_diff(emb, orig, box):
    """So màu vùng khớp: phát hiện ảnh gốc là bản nháp (thiếu nhân vật,
    khác chỉnh màu) so với bản cuối trong sách. Trả về (trung bình, p95)."""
    x, y, w, h = box
    W, H = orig.size
    crop = orig.crop((round(x * W), round(y * H), round((x + w) * W), round((y + h) * H)))
    S = (160, max(8, round(160 * emb.height / emb.width)))
    a = np.asarray(to_rgb(emb).resize(S, Image.BOX), dtype=np.float32)
    b = np.asarray(to_rgb(crop).resize(S, Image.BOX), dtype=np.float32)
    a = cv2.GaussianBlur(a, (5, 5), 0); b = cv2.GaussianBlur(b, (5, 5), 0)
    d = np.abs(a - b).mean(axis=2)
    if emb.mode in ('RGBA', 'LA'):   # bỏ vùng trong suốt của ảnh trong sách
        m = np.asarray(emb.getchannel('A').resize(S, Image.BOX)) > 200
        d = d[m] if m.any() else d.ravel()
    return float(d.mean()), float(np.percentile(d, 95))


_THUMBS = None


def _init_worker(paths):
    global _THUMBS
    _THUMBS = orig_thumbs_serial(paths)


def orig_thumbs_serial(paths):
    return {p: np.load(f) for p, f in map(_thumb_job, paths) if f}


def _match_job(job):
    xref, E = job
    return xref, best_match(E, _THUMBS)


def chapter_of(page):
    ch = None
    for c in CFG['chapters']:
        if page >= c['page']:
            ch = c['n']
    return ch  # None = trang bìa / mục lục


def classify(rect, im):
    w = min(rect.x1, 2 * PAGE_W) - max(rect.x0, 0)
    h = min(rect.y1, PAGE_H) - max(rect.y0, 0)
    frac = (w * h) / (PAGE_W * PAGE_H)
    aspect = max(w, h) / max(1, min(w, h))
    if frac < 0.035 or aspect > 5:
        return 'ornament'
    if im.mode in ('RGBA', 'LA'):
        a = np.asarray(im.getchannel('A'), dtype=np.float32) / 255
        if a.mean() < 0.88:
            # lớp trang trí trong suốt phủ cả hai trang (dây xích, viền...) -> bỏ
            return 'ornament' if w > 1.3 * PAGE_W else 'cutout'
    if frac >= 0.42 or w >= 0.9 * PAGE_W or h >= 0.95 * PAGE_H:
        return 'full'
    return 'inline'


def white_border(im):
    """Ảnh JPG nền trắng (đặt trên trang giấy trắng trong sách)?"""
    g = np.asarray(to_rgb(im).convert('L').resize((200, max(2, round(200 * im.height / im.width)))), dtype=np.float32)
    edge = np.concatenate([g[0], g[-1], g[:, 0], g[:, -1]])
    return edge.mean() > 238 and (edge > 225).mean() > .9


def knock_white(im):
    """Xoá nền trắng nối với mép ảnh (flood fill), mép mềm."""
    rgb = np.asarray(to_rgb(im), dtype=np.uint8)
    h, w = rgb.shape[:2]
    s = min(1.0, 1600 / max(w, h))
    small = cv2.resize(rgb, (round(w * s), round(h * s)), interpolation=cv2.INTER_AREA)
    bright = (small.min(axis=2) > 232).astype(np.uint8)
    mask = np.zeros((small.shape[0] + 2, small.shape[1] + 2), np.uint8)
    for x in range(0, small.shape[1], 4):
        for y in (0, small.shape[0] - 1):
            if bright[y, x] and not mask[y + 1, x + 1]:
                cv2.floodFill(bright, mask, (x, y), 2)
    for y in range(0, small.shape[0], 4):
        for x in (0, small.shape[1] - 1):
            if bright[y, x] and not mask[y + 1, x + 1]:
                cv2.floodFill(bright, mask, (x, y), 2)
    alpha = np.where(bright == 2, 0, 255).astype(np.uint8)
    alpha = cv2.GaussianBlur(cv2.erode(alpha, np.ones((3, 3), np.uint8)), (5, 5), 0)
    alpha = cv2.resize(alpha, (w, h), interpolation=cv2.INTER_LINEAR)
    out = Image.fromarray(rgb).convert('RGBA')
    out.putalpha(Image.fromarray(alpha))
    return out


def crop_like_pdf(orig, box, pdf_im):
    """Cắt ảnh gốc đúng khung như trong sách (box = vùng khớp, theo tỉ lệ ảnh gốc).
    Nếu ảnh trong sách có mép mờ / nền trong suốt (soft mask của InDesign) thì áp lại lên ảnh gốc."""
    x, y, w, h = box
    W, H = orig.size
    c = orig.crop((round(x * W), round(y * H), round((x + w) * W), round((y + h) * H)))
    if pdf_im.mode in ('RGBA', 'LA'):
        a = pdf_im.getchannel('A')
        if a.getextrema()[0] < 250:
            c = c.convert('RGBA')
            pa = a.resize(c.size, Image.BILINEAR)
            if c.mode == 'RGBA' and orig.mode in ('RGBA', 'LA', 'P'):
                pa = Image.fromarray(np.minimum(np.asarray(pa), np.asarray(c.getchannel('A'))))
            c.putalpha(pa)
    return c


def export_page(im, name, max_w=2400):
    """Một bản duy nhất cho trang đọc theo dàn trang (giữ trong suốt nếu có)."""
    alpha = im.mode in ('RGBA', 'LA', 'P') and (im.convert('RGBA').getchannel('A').getextrema()[0] < 250)
    im = im.convert('RGBA') if alpha else to_rgb(im, 255)
    w = min(max_w, im.width)
    h = round(im.height * w / im.width)
    fn = f'{name}-{w}.webp'
    path = os.path.join(IMG_OUT, fn)
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        im.resize((w, h), Image.LANCZOS).save(path, 'WEBP', quality=82, method=5)
    return [fn.replace('\\', '/'), w, h]


def export(src_img, kind, name):
    sizes = SIZES[kind]
    keep_alpha = kind == 'cutout'
    im = src_img.convert('RGBA') if keep_alpha else to_rgb(src_img, 0)
    out = []
    for target in sizes:
        w = min(target, im.width)
        if out and w <= out[-1][1]:
            break
        h = round(im.height * w / im.width)
        fn = f'{name}-{w}.webp'
        path = os.path.join(IMG_OUT, fn)
        if not os.path.exists(path):
            os.makedirs(os.path.dirname(path), exist_ok=True)
            im.resize((w, h), Image.LANCZOS).save(path, 'WEBP', quality=80, method=5)
        out.append((fn.replace('\\', '/'), w, h))
    avg = to_rgb(im, 0).resize((1, 1), Image.BOX).getpixel((0, 0))
    return out, '#%02x%02x%02x' % avg


# ---------------------------------------------------------------- main
def main():
    doc = pymupdf.open(PDF)
    print('PDF', doc.page_count, 'trang')
    links = linked_originals()
    prev = previous_outputs()
    pool = sorted(set(links) | set(render_pool()) | set(prev))
    print('ảnh gốc được link:', len(links), '| dùng lại bản xuất cũ:', len(prev), '| tổng ứng viên:', len(pool))
    thumbs = orig_thumbs(pool)
    print('đã có ảnh nhỏ:', len(thumbs))

    # 1) chuỗi đọc: khối chữ + ảnh, theo (trang, nửa trái/phải, y)
    seq = []
    placements = []
    for pno in range(doc.page_count):
        page = doc[pno]
        for b in page.get_text('blocks'):
            x0, y0, x1, y1, text, _, typ = b
            text = ' '.join(text.split())
            if typ != 0 or len(text) < 3:
                continue
            half = 0 if (x0 + x1) / 2 < PAGE_W else 1
            seq.append(((pno, half, y0), 'text', text))
        for info in page.get_image_info(xrefs=True):
            xref = info['xref']
            if not xref:
                continue
            r = pymupdf.Rect(info['bbox'])
            half = 0 if (r.x0 + r.x1) / 2 < PAGE_W else 1
            item = {'page': pno, 'xref': xref, 'rect': [round(v, 1) for v in r]}
            placements.append(item)
            seq.append(((pno, half, (r.y0 + r.y1) / 2), 'img', item))
    seq.sort(key=lambda s: s[0])

    # 2) neo mỗi ảnh vào đoạn chữ ngay trước / sau trong cùng chương
    for i, (key, kind, obj) in enumerate(seq):
        if kind != 'img':
            continue
        ch = chapter_of(obj['page'])
        before = next((s[2] for s in reversed(seq[:i]) if s[1] == 'text' and chapter_of(s[0][0]) == ch), '')
        after = next((s[2] for s in seq[i + 1:] if s[1] == 'text' and chapter_of(s[0][0]) == ch), '')
        obj['chapter'] = ch
        obj['before'] = before[-160:]
        obj['after'] = after[:160]

    # 3) phân loại + so khớp song song (mỗi xref một lần)
    xinfo = {x[0]: x for p in doc for x in p.get_images(full=True)}
    first = {}
    for obj in placements:
        first.setdefault(obj['xref'], obj)
    imgs, kinds, jobs = {}, {}, []
    for xref, obj in first.items():
        im = pdf_image(doc, xref, xinfo[xref][1])
        imgs[xref] = im
        kinds[xref] = classify(pymupdf.Rect(obj['rect']), im)
        if kinds[xref] != 'ornament':
            jobs.append((xref, gray_small(im)))
    from multiprocessing import Pool
    with Pool(min(10, os.cpu_count()), initializer=_init_worker, initargs=(list(thumbs),)) as pool:
        matches = dict(pool.map(_match_job, jobs, chunksize=2))

    done = {}
    stats = {'orig': 0, 'pdf': 0, 'ornament': 0}
    for k, obj in enumerate(placements):
        xref = obj['xref']
        if xref in done:
            obj.update(done[xref])
            continue
        im, kind = imgs[xref], kinds[xref]
        res = {'kind': kind}
        if kind == 'ornament':
            stats['ornament'] += 1
            files, avg = export(im, 'cutout', f'ornament/x{xref}')
            res.update(files=files, avg=avg, source='pdf', pageimg=list(files[-1]))
        else:
            score, path, box = matches[xref]
            src = im
            page_img = im          # ảnh đúng như đặt trong trang sách (đã cắt khung) — cho trang đọc theo bản dàn trang
            res['source'] = 'pdf'
            if score >= MATCH_OK:
                with Image.open(path) as o:
                    o.load()
                    dm, dp = color_diff(im, o, box)
                    res['diff'] = [round(dm, 1), round(dp, 1)]
                    same = dm <= DIFF_MEAN and dp <= DIFF_P95
                    # cutout chỉ dùng ảnh gốc nếu ảnh gốc có nền trong suốt
                    if same and (kind != 'cutout' or o.mode in ('RGBA', 'LA', 'P')):
                        src = o.copy()
                        res['source'] = os.path.relpath(path, os.path.dirname(WEB)).replace('\\', '/')
                        page_img = crop_like_pdf(src, box, im)
                    res['match'] = os.path.relpath(path, os.path.dirname(WEB)).replace('\\', '/')
            if kind != 'cutout' and white_border(src):
                src = knock_white(src)
                kind = res['kind'] = 'cutout'
                res['knocked'] = True
            stats['orig' if res['source'] != 'pdf' else 'pdf'] += 1
            res['score'] = round(score, 3)
            ch = obj['chapter']
            folder = f'c{ch}' if ch is not None else 'front'
            tag = '' if res['source'] == 'pdf' else '-' + hashlib.md5(res['source'].encode()).hexdigest()[:6]
            tag += '-k' if res.get('knocked') else ''
            files, avg = export(src, kind, f'{folder}/x{xref}{tag}')
            res.update(files=files, avg=avg, pageimg=export_page(page_img, f'page/x{xref}{tag}'))
            print(f'  p{obj["page"]:3d} x{xref:<5d} {kind:7s} {score:.2f} {res.get("diff")} {res["source"][-60:]}')
        done[xref] = res
        obj.update(res)

    # giữ manifest lần trước (previous_outputs() đọc lại khi ảnh gốc bị chuyển khỏi ổ)
    mf = os.path.join(CACHE, 'manifest.json')
    if os.path.exists(mf):
        import shutil, time
        stamp = time.strftime('%Y%m%d-%H%M', time.localtime(os.path.getmtime(mf)))
        shutil.copy2(mf, os.path.join(CACHE, f'manifest-{stamp}.json'))
    json.dump({'placements': placements}, open(mf, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    # xoá ảnh cũ không còn dùng
    used = {os.path.normcase(os.path.join(IMG_OUT, f)) for o in placements for f, _, _ in o.get('files', [])}
    used |= {os.path.normcase(os.path.join(IMG_OUT, o['pageimg'][0])) for o in placements if o.get('pageimg')}
    for dp, _, fs in os.walk(IMG_OUT):
        for f in fs:
            p = os.path.normcase(os.path.join(dp, f))
            if p not in used:
                os.remove(p)
    print('xong:', stats)


if __name__ == '__main__':
    main()
