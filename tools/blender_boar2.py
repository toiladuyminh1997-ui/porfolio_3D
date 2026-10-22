"""Mô hình lợn rừng có texture (web/lon rung) -> src/models/boar.glb cho phần đầu trang.

  blender -b --factory-startup -P web/tools/blender_boar2.py            # xem thử (ảnh trong tools/.cache)
  set EXPORT=1 & blender -b --factory-startup -P web/tools/blender_boar2.py   # xuất glb
"""
import bpy, os, math, mathutils

ROOT = r'E:\Profolio 3D\web'
SRC = os.path.join(ROOT, 'lon rung', '564caa84a3af93698b5c21ee99399f68.obj')
# bản nhẹ cho điện thoại: set OUT=...\boar-m.glb & set FACES=25000 & set TEX=1024 & set BRANCH_FACES=12000
OUT = os.environ.get('OUT') or os.path.join(ROOT, 'src', 'models', 'boar.glb')
CACHE = os.path.join(ROOT, 'tools', '.cache')
FACES = int(os.environ.get('FACES', 60000))
TEX = int(os.environ.get('TEX', 2048))
BRANCH_FACES = int(os.environ.get('BRANCH_FACES', 30000))

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(filepath=SRC)
obs = [o for o in bpy.data.objects if o.type == 'MESH']
bpy.context.view_layer.objects.active = obs[0]
for o in obs:
    o.select_set(True)
if len(obs) > 1:
    bpy.ops.object.join()
ob = bpy.context.view_layer.objects.active
tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
print('faces', len(ob.data.polygons), 'tris', tris, 'uv', len(ob.data.uv_layers), 'mats', [m.name for m in ob.data.materials])
# giảm sơ bộ rồi tách thành 2 vật: thân lợn (khối liền lớn nhất — đầu sẽ cử động bằng shader)
# và cành cây/lá/đất văng xung quanh (đứng yên, không bị uốn theo đầu)
m = ob.modifiers.new('dec0', 'DECIMATE'); m.ratio = min(1.0, 300000 / tris)
bpy.ops.object.modifier_apply(modifier=m.name)
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.separate(type='LOOSE'); bpy.ops.object.mode_set(mode='OBJECT')
parts = sorted([o for o in bpy.data.objects if o.type == 'MESH'], key=lambda o: len(o.data.vertices), reverse=True)
print('parts', len(parts), [len(p.data.vertices) for p in parts[:6]])


def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for p in objs:
        p.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = o.data.name = name
    return o


def decimate(o, faces):
    t = sum(len(p.vertices) - 2 for p in o.data.polygons)
    if t > faces:
        bpy.ops.object.select_all(action='DESELECT'); o.select_set(True)
        bpy.context.view_layer.objects.active = o
        md = o.modifiers.new('dec', 'DECIMATE'); md.ratio = faces / t
        bpy.ops.object.modifier_apply(modifier=md.name)


body = join([parts[0]], 'boar_body')
branches = join(parts[1:], 'boar_branches') if len(parts) > 1 else None
decimate(body, FACES)
if branches:
    decimate(branches, BRANCH_FACES)
# chuẩn hoá theo thân lợn (thân dài 2 đơn vị, tâm ở gốc) — cành cây dùng cùng phép biến đổi
bb = [body.matrix_world @ mathutils.Vector(c) for c in body.bound_box]
lo = mathutils.Vector([min(v[i] for v in bb) for i in range(3)])
hi = mathutils.Vector([max(v[i] for v in bb) for i in range(3)])
ext = hi - lo
s = 2.0 / max(ext)
T = mathutils.Matrix.Diagonal((s, s, s, 1)) @ mathutils.Matrix.Translation(-(lo + hi) / 2)
for o in [body] + ([branches] if branches else []):
    o.data.transform(T @ o.matrix_world)
    o.matrix_world = mathutils.Matrix.Identity(4)
ob = body
print('extent', tuple(round(e * s, 3) for e in ext), 'body tris', sum(len(p.vertices) - 2 for p in body.data.polygons),
      'branch tris', sum(len(p.vertices) - 2 for p in branches.data.polygons) if branches else 0)

for mat in ob.data.materials:
    for n in (mat.node_tree.nodes if mat and mat.use_nodes else []):
        if n.type == 'TEX_IMAGE' and n.image:
            print('tex', n.image.name, tuple(n.image.size))

# mũi lợn hướng -Y (Blender) = +Z (glTF/three.js). In ra phân bố để chọn điểm cổ.
ys = sorted(v.co.y for v in ob.data.vertices)
print('y range', round(ys[0], 3), round(ys[-1], 3))
front = [v.co for v in ob.data.vertices if v.co.y < ys[0] + 0.12]
print('snout center', tuple(round(sum(c[i] for c in front) / len(front), 3) for i in range(3)))

if os.environ.get('EXPORT'):
    for mat in ob.data.materials:
        nt = mat.node_tree if mat and mat.use_nodes else None
        for n in (list(nt.nodes) if nt else []):
            if n.type == 'TEX_IMAGE' and n.image and n.image.size[0] == 0:   # normal map bị thiếu file
                nt.nodes.remove(n)
    for mat in ob.data.materials:
        for n in (mat.node_tree.nodes if mat and mat.use_nodes else []):
            if n.type == 'TEX_IMAGE' and n.image and max(n.image.size) > TEX:
                n.image.scale(TEX, TEX)
    for o in [o for o in bpy.data.objects if o.type == 'MESH']:
        bpy.ops.object.select_all(action='DESELECT'); o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.shade_smooth()
    bpy.ops.export_scene.gltf(filepath=OUT, use_selection=False, export_format='GLB',
                              export_image_format='WEBP', export_image_quality=82,
                              export_yup=True, export_apply=True)
    print('exported', OUT, os.path.getsize(OUT) // 1024, 'KB')
else:
    scn = bpy.context.scene
    scn.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
    scn.render.resolution_x = scn.render.resolution_y = 840
    w = bpy.data.worlds.new('w'); scn.world = w; w.color = (0.3, 0.3, 0.3)
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); scn.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(50), 0, math.radians(30)); sun.data.energy = 3
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); scn.collection.objects.link(cam)
    scn.camera = cam; cam.data.type = 'ORTHO'; cam.data.ortho_scale = 2.4
    for tag, loc, rot in (('front', (0, -6, 0), (90, 0, 0)), ('side', (6, 0, 0), (90, 0, 90)),
                          ('top', (0, 0, 6), (0, 0, 0))):
        cam.location = loc; cam.rotation_euler = [math.radians(a) for a in rot]
        scn.render.filepath = os.path.join(CACHE, f'boar2_{tag}.png')
        bpy.ops.render.render(write_still=True)
