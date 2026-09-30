"""Derive the headless seated hero prop from the authored Core rig.
Run: blender -b --python tools/build-seated-body.py
The standing model remains untouched.
"""
import bpy,runpy,sys,subprocess,tempfile
from pathlib import Path
from mathutils import Vector
root_dir=Path(__file__).resolve().parent.parent
saved=sys.argv;sys.argv=[str(root_dir/'tools/build-core-mesh.py')]
rig=runpy.run_path(str(root_dir/'tools/build-core-mesh.py'));sys.argv=saved
body,root,joints=rig['body'],rig['root'],rig['joints']
for obj in [root,*root.children_recursive]:obj.animation_data_clear()
neck=rig['neck']
for obj in [*neck.children_recursive,neck]:bpy.data.objects.remove(obj,do_unlink=True)
body.location=(0,0,0);body.rotation_euler=(0,0,0)
for side,name in [(-1,'Left'),(1,'Right')]:
 joints[name+'Hip'].rotation_euler=(-1.38,-side*.10,0)
 joints[name+'Knee'].rotation_euler=(1.48,0,0)
 joints[name+'Ankle'].rotation_euler=(-.10,0,0)
 # Bent elbows bring the mittens to the thighs; all socket translations stay fixed.
 joints[name+'Shoulder'].rotation_euler=(-.12,side*.18,0)
 joints[name+'Elbow'].rotation_euler=(-1.58,0,0)
 joints[name+'Wrist'].rotation_euler=(.05,0,0)
scene=bpy.context.scene
scene.frame_set(1);bpy.context.view_layer.update()
points=[obj.matrix_world@Vector(corner) for obj in root.children_recursive if obj.type=='MESH' for corner in obj.bound_box]
low=min(p.z for p in points);root.location.z=-low
# Seated, gently turned toward the hero rather than straight at the viewer.
cam=scene.camera;cam.location=(1.8,-4.5,2.8);target=Vector((0,-.22,.69));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=1.94
scene.render.resolution_x=640;scene.render.resolution_y=640;scene.cycles.samples=32
out=root_dir/'public/assets/robots';(out/'models').mkdir(exist_ok=True)
bpy.ops.object.select_all(action='DESELECT')
for obj in [root,*root.children_recursive]:obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(out/'models/slop-seated.glb'),export_format='GLB',use_selection=True,export_apply=True,export_animations=False)
with tempfile.TemporaryDirectory(prefix='slop-seated-') as temp:
 scene.render.image_settings.file_format='PNG';scene.render.filepath=str(Path(temp)/'seated.png');bpy.ops.render.render(write_still=True)
 subprocess.run(['cwebp','-quiet','-q','88',scene.render.filepath,'-o',str(out/'seated-body.webp')],check=True)
