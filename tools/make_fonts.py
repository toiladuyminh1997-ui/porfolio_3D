"""Chuyển phông dùng trong bản dàn trang (cài trong Windows) sang woff2 cho web, chỉ giữ chữ Latin + tiếng Việt.

    python tools/make_fonts.py   ->  src/assets/fonts/*.woff2
"""
import os
from fontTools import subset
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), 'src', 'assets', 'fonts')
WIN = r'C:\Windows\Fonts'
FONTS = {
    'aptima-regular': 'UTM Aptima.ttf',
    'aptima-italic': 'UTM AptimaItalic.ttf',
    'aptima-bold': 'UTM AptimaBold.ttf',
}
UNICODES = ('U+0000-00FF,U+0100-024F,U+0300-036F,U+1EA0-1EF9,U+2000-206F,U+20AB,U+2190-21FF,'
            'U+2600-27BF,U+FEFF,U+FFFD')

os.makedirs(OUT, exist_ok=True)
for name, file in FONTS.items():
    src = os.path.join(WIN, file)
    if not os.path.exists(src):
        print('thiếu', src)
        continue
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    f = TTFont(src)
    s = subset.Subsetter(opts)
    s.populate(unicodes=subset.parse_unicodes(UNICODES))
    s.subset(f)
    dst = os.path.join(OUT, name + '.woff2')
    f.flavor = 'woff2'
    f.save(dst)
    print(name, os.path.getsize(dst) // 1024, 'KB')
