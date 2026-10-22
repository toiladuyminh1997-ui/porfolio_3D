"""Bản đồ chuyển động cho ảnh minh hoạ (chế độ Đọc: ảnh "sống" nhẹ — cây lay, nước gợn, người thở).

    python tools/motion_maps.py          # tạo cho ảnh mới (đã có thì bỏ qua)
    python tools/motion_maps.py --force  # tạo lại tất cả

Với mỗi ảnh trang dàn trang site/img/page/*.webp (ảnh có nền, không phải ảnh tách nền) tạo
tools/.cache/motion/<tên>.webp (gộp lại thành site/img/motion/atlas-N.webp + atlas.json),
ảnh nhỏ RGBA (rộng 320px, nén không mất dữ liệu):
    R = cây / cỏ / hoa / vải cờ  (lay theo gió)
    G = người / con vật          (thở, cử động nhẹ)
    B = độ gần (1 = gần máy)     (chiều sâu khi rê chuột)
    A = 255 - nước               (gợn nước; ảnh không có nước thì A = 255)
Mô hình (ONNX, chạy CPU): Depth Anything V2 Small + SegFormer-B0 ADE20K trong tools/.cache/models/.
"""
import glob, os, sys
import cv2
import numpy as np
import onnxruntime as ort
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.dirname(HERE)
MODELS = os.path.join(HERE, '.cache', 'models')
SRC = os.path.join(WEB, 'site', 'img', 'page')
DST = os.path.join(HERE, '.cache', 'motion')                # bản đồ từng ảnh
ATLAS_DIR = os.path.join(WEB, 'site', 'img', 'motion')      # bản đồ gộp, dùng trên web
ATLAS_H = 4000                                              # dưới giới hạn texture 4096 của WebGL
OUT_W = 320

MEAN = np.array([0.485, 0.456, 0.406], np.float32)
STD = np.array([0.229, 0.224, 0.225], np.float32)
# nhãn ADE20K (seg_config.json) -> nhóm chuyển động, kèm trọng số
FOLIAGE = {4: 1.0, 9: .8, 17: 1.0, 66: .9, 72: 1.0, 29: .45, 106: .6, 149: 1.0, 18: .7}   # cây, cỏ, cây bụi, hoa, cọ, đồng, tán, cờ, rèm
CREATURE = {12: 1.0, 126: 1.0}                                                         # người, con vật
WATER = {21: 1.0, 26: 1.0, 60: 1.0, 128: 1.0, 113: 1.0, 104: 1.0}                      # nước, biển, sông, hồ, thác, đài phun


def prep(rgb, h, w):
    x = cv2.resize(rgb, (w, h), interpolation=cv2.INTER_AREA).astype(np.float32) / 255
    return ((x - MEAN) / STD).transpose(2, 0, 1)[None]


def main():
    force = '--force' in sys.argv
    os.makedirs(DST, exist_ok=True)
    depth = ort.InferenceSession(os.path.join(MODELS, 'depth.onnx'))
    seg = ort.InferenceSession(os.path.join(MODELS, 'seg.onnx'))
    files = sorted(glob.glob(os.path.join(SRC, '*.webp')))
    done = 0
    for f in files:
        out = os.path.join(DST, os.path.basename(f))
        if os.path.exists(out) and not force:
            continue
        im = Image.open(f)
        if im.mode in ('RGBA', 'LA') and np.asarray(im.getchannel('A')).min() < 250:
            continue   # ảnh tách nền: cử động bằng CSS, không cần bản đồ
        rgb = np.asarray(im.convert('RGB'))
        H, W = rgb.shape[:2]
        oh = round(H * OUT_W / W)

        # độ sâu (Depth Anything trả về nghịch đảo khoảng cách: lớn = gần)
        dh = 518
        dw = max(14, round(W * dh / H / 14) * 14)
        if dw > 1036:
            dw, dh = 1036, max(14, round(H * 1036 / W / 14) * 14)
        d = depth.run(None, {'pixel_values': prep(rgb, dh, dw)})[0][0]
        d = cv2.resize(d, (OUT_W, oh), interpolation=cv2.INTER_AREA)
        lo, hi = np.percentile(d, 2), np.percentile(d, 98)
        d = np.clip((d - lo) / max(hi - lo, 1e-6), 0, 1)

        # phân vùng (SegFormer, kích thước bội số của 32)
        sh = 512
        sw = max(32, round(W * sh / H / 32) * 32)
        if sw > 1024:
            sw, sh = 1024, max(32, round(H * 1024 / W / 32) * 32)
        lg = seg.run(None, {'pixel_values': prep(rgb, sh, sw)})[0][0]
        lg = lg - lg.max(0, keepdims=True)
        p = np.exp(lg)
        p /= p.sum(0, keepdims=True)
        group = lambda g: np.clip(sum(p[k] * w for k, w in g.items()), 0, 1)
        sig = OUT_W * .012
        masks = []
        for g in (FOLIAGE, CREATURE, WATER):
            m = cv2.resize(group(g), (OUT_W, oh), interpolation=cv2.INTER_LINEAR)
            m = np.clip((m - .25) / .5, 0, 1)            # bỏ vùng lưỡng lự
            masks.append(cv2.GaussianBlur(m, (0, 0), sig))  # mép mềm: chỗ uốn không bị gãy
        fol, cre, wat = masks
        rgba = np.dstack([fol, cre, d, 1 - wat])
        Image.fromarray((rgba * 255).round().astype(np.uint8), 'RGBA').save(out, 'WEBP', lossless=True, quality=100)
        done += 1
        print(f'{os.path.basename(f):32s} cây {fol.mean():.2f}  người {cre.mean():.2f}  nước {wat.mean():.2f}')
    print('xong:', done, 'bản đồ ->', DST)
    atlas()


def atlas():
    """Gộp các bản đồ thành vài ảnh lớn (site/img/motion/atlas-N.webp, cao tối đa ATLAS_H) + atlas.json:
    tên ảnh -> [file atlas, y, cao, cao atlas]. Bớt số file (Artifact giới hạn ~511 file / phiên bản);
    ảnh xếp theo số xref (= thứ tự trang trong PDF) nên ảnh gần nhau trong sách nằm chung một atlas."""
    import json, re
    names = sorted((f for f in os.listdir(DST) if f.endswith('.webp')), key=lambda f: int(re.match(r'x(\d+)', f).group(1)))
    os.makedirs(ATLAS_DIR, exist_ok=True)
    for old in glob.glob(os.path.join(ATLAS_DIR, 'atlas-*.webp')):
        os.remove(old)
    groups, cur, h = [], [], 0
    for f in names:
        im = Image.open(os.path.join(DST, f)).convert('RGBA')
        if cur and h + im.height > ATLAS_H:
            groups.append(cur)
            cur, h = [], 0
        cur.append((f, im))
        h += im.height
    if cur:
        groups.append(cur)
    index = {}
    for gi, g in enumerate(groups):
        H = sum(im.height for _, im in g)
        sheet = Image.new('RGBA', (OUT_W, H))
        y = 0
        for f, im in g:
            sheet.paste(im, (0, y))
            index[f] = [f'atlas-{gi}.webp', y, im.height, H]
            y += im.height
        # alpha (nước) phải giữ nguyên: lưu không mất dữ liệu, kể cả khi alpha toàn 255
        sheet.save(os.path.join(ATLAS_DIR, f'atlas-{gi}.webp'), 'WEBP', lossless=True, quality=100, exact=True)
    json.dump(index, open(os.path.join(ATLAS_DIR, 'atlas.json'), 'w'), indent=0)
    print('atlas:', len(groups), 'file ->', ATLAS_DIR)


if __name__ == '__main__':
    main()
