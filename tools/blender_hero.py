"""Chuẩn bị mô hình 3D cho phần đầu trang chủ (chạy bằng Blender, không giao diện):

  blender -b --factory-startup -P web/tools/blender_hero.py

- đầu lợn rừng (ZBrush, ~755k mặt) -> giảm còn ~BOAR_FACES mặt -> src/models/boar.glb
- quạ (OBJ + texture PBR)          -> giảm còn ~RAVEN_FACES mặt -> src/models/raven.glb
Kèm ảnh xem thử từ trước / bên cạnh trong tools/.cache/ để kiểm tra hướng mô hình.
"""
import bpy, os, math, mathutils

ROOT = r'E:\Profolio 3D'
OUT = os.path.join(ROOT, 'web', 'src', 'models')
CACHE = os.path.join(ROOT, 'web', 'tools', '.cache')
BOAR = os.path.join(ROOT, 'Minh', 'đầu lợn', 'PM3D_Sphere3D2.obj')
RAVEN = os.path.join(ROOT, 'boi canh', 'chuong 0', 'canh di trong tuyet giua rung', 'qua',
                     '9a884862c6c25044be866afe29b0374d.obj')
BOAR_FACES = 70_000
BOAR_CUT = 0.36       # (toạ độ sau normalize, cao -1..1) — dưới mức này là tấm da phủ
RAVEN_FACES = 2_400
os.makedirs(OUT, exist_ok=True)


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_obj(path):
    before = set(bpy.data.objects)
    bpy.ops.wm.obj_import(filepath=path)
    objs = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    bpy.context.view_layer.objects.active = objs[0]
    for o in objs:
        o.select_set(True)
    if len(objs) > 1:
        bpy.ops.object.join()
    return bpy.context.view_layer.objects.active


def decimate(ob, faces):
    n = len(ob.data.polygons)
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)   # decimate tính theo tam giác
    if tris > faces:
        m = ob.modifiers.new('dec', 'DECIMATE')
        m.ratio = faces / tris
        bpy.ops.object.modifier_apply(modifier=m.name)
    print(ob.name, n, '->', len(ob.data.polygons), 'faces')


def normalize(ob, size=2.0):
    """Đưa tâm về gốc toạ độ, cạnh lớn nhất = size, áp dụng transform."""
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bb = [mathutils.Vector(c) for c in ob.bound_box]
    lo = mathutils.Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb)))
    hi = mathutils.Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)))
    ctr, ext = (lo + hi) / 2, hi - lo
    s = size / max(ext)
    ob.data.transform(mathutils.Matrix.Diagonal((s, s, s, 1)) @ mathutils.Matrix.Translation(-ctr))
    print(ob.name, 'extent (x,y,z) =', tuple(round(e * s, 3) for e in ext))


def preview(ob, name):
    scn = bpy.context.scene
    scn.render.engine = 'BLENDER_WORKBENCH'
    scn.render.resolution_x = scn.render.resolution_y = 420
    scn.display.shading.light = 'MATCAP' if False else 'STUDIO'
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    scn.collection.objects.link(cam)
    scn.camera = cam
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = 2.6
    # Blender: -Y là phía trước (nhìn từ trước), X phải, Z lên
    for tag, loc, rot in (('front', (0, -6, 0), (90, 0, 0)), ('side', (6, 0, 0), (90, 0, 90)),
                          ('q34', (4.2, -4.2, -1.2), (100, 0, 45))):
        cam.location = loc
        cam.rotation_euler = [math.radians(a) for a in rot]
        scn.render.filepath = os.path.join(CACHE, f'{name}_{tag}.png')
        bpy.ops.render.render(write_still=True)


def export(ob, path, materials):
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.ops.object.shade_smooth()
    bpy.ops.export_scene.gltf(filepath=path, use_selection=True, export_format='GLB',
                              export_materials='EXPORT' if materials else 'NONE',
                              export_image_format='WEBP' if materials else 'AUTO',
                              export_yup=True, export_apply=True, export_texcoords=materials,
                              export_normals=True)
    print('exported', path, os.path.getsize(path) // 1024, 'KB')


def keep_above(ob, z):
    """Mô hình là mũ da lợn có tấm da phủ dài: chỉ giữ phần đầu (trên mặt cắt z), bịt lỗ cắt."""
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.bisect(plane_co=(0, 0, z), plane_no=(0, 0, 1), clear_inner=True, use_fill=True)
    bpy.ops.object.mode_set(mode='OBJECT')


# ---- lợn rừng
clear()
boar = import_obj(BOAR)
decimate(boar, BOAR_FACES * 2)
normalize(boar)
keep_above(boar, BOAR_CUT)
decimate(boar, BOAR_FACES)
normalize(boar)
preview(boar, 'boar')
export(boar, os.path.join(OUT, 'boar.glb'), materials=False)

if os.environ.get('SKIP_RAVEN'):
    raise SystemExit

# ---- quạ
clear()
raven = import_obj(RAVEN)
decimate(raven, RAVEN_FACES)
normalize(raven)
for mat in raven.data.materials:          # thu nhỏ texture cho web
    for n in (mat.node_tree.nodes if mat and mat.use_nodes else []):
        if n.type == 'TEX_IMAGE' and n.image:
            n.image.scale(512, 512)
preview(raven, 'raven')
export(raven, os.path.join(OUT, 'raven.glb'), materials=True)
