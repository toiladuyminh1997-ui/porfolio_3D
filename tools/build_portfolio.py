"""Trang portfolio (phong cách thế giới 3D tối, các dự án là tấm kính nổi quanh cây hạt sáng).

    python tools/build_portfolio.py      ->  docs/portfolio/   (GitHub Pages: .../porfolio_3D/portfolio/)

Mỗi chương có minh hoạ = một dự án (ảnh lấy từ manifest của trang sách), thêm bộ "Nhân vật" từ ảnh tách nền.
Mã trang ở src/portfolio/ (index.html, portfolio.css, portfolio.js); three.js dùng chung docs/assets/vendor.
"""
import json, os, shutil
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.dirname(HERE)
SRC = os.path.join(WEB, 'src', 'portfolio')
SITE_IMG = os.path.join(WEB, 'site', 'img')
OUT = os.path.join(WEB, 'docs', 'portfolio')
CFG = json.load(open(os.path.join(HERE, 'chapters.json'), encoding='utf8'))
PLACEMENTS = json.load(open(os.path.join(HERE, '.cache', 'manifest.json'), encoding='utf8'))['placements']

SIZES = {'card': 1280, 'thumb': 640, 'full': 1800}


def biggest(p):
    return max(p['files'], key=lambda f: f[1])


def export(p, used):
    """Ảnh -> img/<tên>-{card,thumb,full}.webp; trả về tên gốc + kích thước."""
    f, w, h = biggest(p)
    base = os.path.splitext(os.path.basename(f))[0]
    if base not in used:
        im = Image.open(os.path.join(SITE_IMG, f))
        im = im.convert('RGBA') if im.mode in ('RGBA', 'LA', 'P') else im.convert('RGB')
        for k, W in SIZES.items():
            r = im if im.width <= W else im.resize((W, round(im.height * W / im.width)), Image.LANCZOS)
            r.save(os.path.join(OUT, 'img', f'{base}-{k}.webp'), 'WEBP', quality=82 if k != 'thumb' else 76, method=5)
        used.add(base)
    return {'f': base, 'w': w, 'h': h, 'avg': p.get('avg', '#222')}


def main():
    shutil.rmtree(OUT, ignore_errors=True)
    os.makedirs(os.path.join(OUT, 'img'))
    used, projects = set(), []
    for ch in CFG['chapters']:
        imgs = [p for p in PLACEMENTS if p.get('chapter') == ch['n'] and p['kind'] in ('full', 'inline') and p.get('files')]
        if not imgs:
            continue   # chương chưa có minh hoạ
        seen, gal = set(), []
        for p in imgs:
            k = biggest(p)[0]
            if k in seen:
                continue
            seen.add(k)
            gal.append(export(p, used))
        cover = max(gal[:4], key=lambda g: g['w'] / g['h'])   # ảnh ngang nhất trong mấy ảnh đầu chương làm bìa
        projects.append({
            'slug': f'chuong-{ch["n"]}', 'n': ch['n'], 'label': ch['label'], 'title': ch['title'], 'en': ch['title_en'],
            'kind': 'Bối cảnh 3D', 'bg': ch['bg'], 'accent': ch['accent'], 'cover': cover, 'gallery': gal,
            'read': f'../chuong-{ch["n"]}.html',
        })
    # bộ nhân vật: ảnh tách nền đủ lớn, mỗi chương vài ảnh
    cuts, seen = [], set()
    for p in PLACEMENTS:
        if p['kind'] != 'cutout' or not p.get('files'):
            continue
        f, w, h = biggest(p)
        if f in seen or w * h < 300 * 300:
            continue
        seen.add(f)
        cuts.append(export(p, used))
    if cuts:
        projects.append({
            'slug': 'nhan-vat', 'n': None, 'label': 'Bộ sưu tập', 'title': 'Nhân vật', 'en': 'Characters',
            'kind': 'Nhân vật 3D', 'bg': '#120f1a', 'accent': '#d6b4ff', 'cover': None, 'cutouts': True, 'gallery': cuts,
            'read': None,
        })
    for f in os.listdir(SRC):
        shutil.copy2(os.path.join(SRC, f), os.path.join(OUT, f))
    data = {'title': CFG['book']['title'], 'title_en': CFG['book']['title_en'], 'projects': projects}
    with open(os.path.join(OUT, 'data.js'), 'w', encoding='utf8') as fp:
        fp.write('window.PORTFOLIO = ' + json.dumps(data, ensure_ascii=False) + ';\n')
    n_img = len(os.listdir(os.path.join(OUT, 'img')))
    mb = sum(os.path.getsize(os.path.join(OUT, 'img', f)) for f in os.listdir(os.path.join(OUT, 'img'))) / 1e6
    print(f'{len(projects)} dự án, {n_img} file ảnh ({mb:.1f} MB) -> {OUT}')


if __name__ == '__main__':
    main()
