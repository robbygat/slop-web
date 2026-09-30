import bpy, math, json
from mathutils import Vector
from mathutils.geometry import tessellate_polygon
from math import sin, cos, pi

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.samples=24
scene.render.resolution_x=640
scene.render.resolution_y=800
scene.render.resolution_percentage=100
scene.render.film_transparent=True
scene.render.fps=30
scene.frame_start=1
scene.frame_end=180
if scene.world is None:scene.world=bpy.data.worlds.new('Studio ambient')
scene.world.color=(.22,.22,.22)

def mat(name,color,metallic=0,rough=.24,coat=.35,emission=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metallic;p.inputs['Roughness'].default_value=rough;p.inputs['Coat Weight'].default_value=coat;p.inputs['Coat Roughness'].default_value=.16
 if emission:p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emission
 return m
pearl=mat('Shell • pearl ceramic',(.92,.90,1),.19,.19,.65)
blue=mat('Accent • sky enamel',(.035,.43,.90),.22,.16,.7)
edge=mat('Trim • lavender',(.52,.45,.70),.34,.24)
graphite=mat('Joints • soft graphite',(.023,.027,.035),.35,.24)
rubber=mat('Soles • soft black',(.01,.016,.022),0,.4)
glass=mat('Visor • smoked glass',(.012,.023,.024),.22,.13,.9)
lime=mat('Face • Slop lime',(.48,1,.02),0,.25,.15,2.2)
cyan=mat('Light • cyan',(.05,.7,1),.05,.16,.5,1.2)
white=mat('Diamond • pearl',(.86,.97,1),.23,.12,.7)

def empty(name,loc=(0,0,0),parent=None):
 o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.parent=parent;o.location=loc;return o
root=empty('SlopCore')
body=empty('BodyMount',(0,0,0),root)

def mesh(name,verts,faces,material,parent,loc=(0,0,0)):
 data=bpy.data.meshes.new(name);data.from_pydata(verts,[],faces);data.update();o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o);o.parent=parent;o.location=loc;o.data.materials.append(material)
 for p in data.polygons:p.use_smooth=True
 return o

def ellipsoid(name,loc,scale,material,parent,segments=40,rings=24):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,radius=1)
 o=bpy.context.object;o.name=name;o.parent=parent;o.location=loc;o.scale=scale;o.data.materials.append(material)
 for p in o.data.polygons:p.use_smooth=True
 return o

def rounded(name,loc,size,radius,material,parent):
 bpy.ops.mesh.primitive_cube_add(size=1);o=bpy.context.object;o.name=name;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 o.parent=parent;o.location=loc;o.data.materials.append(material);b=o.modifiers.new('Soft manufactured edges','BEVEL');b.width=radius;b.segments=6
 o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL');return o

def armor(name,profile,material,parent,depth=.86,center=(0,0,0)):
 # Revolved shaped cuff. Profile includes closed rounded ends; each ring is measured from its pivot.
 verts=[];faces=[];n=40
 for z,r in profile:
  for i in range(n):
   a=2*pi*i/n;verts.append((r*cos(a),r*sin(a)*depth,z))
 for j in range(len(profile)-1):
  for i in range(n):
   a=j*n+i;b=j*n+(i+1)%n;faces.append((a,b,b+n,a+n))
 faces.extend([tuple(reversed(tuple(range(n)))),tuple((len(profile)-1)*n+i for i in range(n))])
 return mesh(name,verts,faces,material,parent,center)

pelvis=empty('Pelvis',(0,0,.91),body)

torso=empty('Torso',(0,0,1.17),body)
# A gently tapering breastplate; no exposed stack of primitive beads.
armor('Chest ceramic',[(-.38,.025),(-.36,.09),(-.31,.17),(-.24,.222),(-.15,.257),(-.04,.276),(.06,.271),(.15,.249),(.21,.197),(.235,.13),(.239,.045)],pearl,torso,.68)
ellipsoid('Chest lamp bezel',(0,-.178,.052),(.053,.013,.053),blue,torso)
ellipsoid('Chest lamp',(0,-.189,.052),(.037,.012,.037),cyan,torso)
neck=empty('Neck',(0,0,1.40),body)
armor('Neck joint',[(-.07,.08),(-.055,.105),(.018,.102),(.048,.075)],graphite,neck,.9)
head=empty('HeadMount',(0,0,1.82),neck)
# HeadMount is a real articulation socket; its offset is relative to the neck pivot.
head.location=(0,0,.42)
corehead=empty('CoreHead',(0,0,0),head)
rounded('Monitor housing',(0,0,0),(1.13,.56,.80),.215,pearl,corehead)
rounded('Rear service panel',(0,.268,0),(.69,.018,.47),.15,edge,corehead)
rounded('Rear pearl inset',(0,.279,0),(.65,.014,.43),.14,pearl,corehead)
for x in [-.10,0,.10]:rounded('Rear ventilation',(x,.291,0),(.035,.01,.16),.012,graphite,corehead)
# Concentric smooth superellipse rings form curved glass and its visible gasket.
def visor(name,width,height,y,material):
 verts=[(0,y,0)];faces=[];steps=64;rings=18;power=.50
 for j in range(1,rings+1):
  r=j/rings
  for i in range(steps):
   a=2*pi*i/steps;x=width*math.copysign(abs(cos(a))**power,cos(a))*r;z=height*math.copysign(abs(sin(a))**power,sin(a))*r
   verts.append((x,y+.067*r*r,z))
 for i in range(steps):faces.append((0,1+i,1+(i+1)%steps))
 for j in range(rings-1):
  for i in range(steps):a=1+j*steps+i;b=1+j*steps+(i+1)%steps;faces.append((a,a+steps,b+steps,b))
 return mesh(name,verts,faces,material,corehead)
visor('Visor gasket',.489,.332,-.342,graphite)
visor('Curved screen',.466,.310,-.353,glass)
for side in [-1,1]:
 ear=empty(('Left' if side<0 else 'Right')+'Ear',(.551*side,0,0),corehead);ear.rotation_euler[1]=pi/2
 armor('Ear graphite mount',[(-.045,.143),(-.025,.152),(.02,.152),(.04,.14)],graphite,ear)
 armor('Ear sky enamel',[(.027,.135),(.052,.132),(.074,.112),(.082,.035)],blue,ear)
 # recessed perimeter fasteners


# Exact Slop path, sampled as cubic Beziers into a flush emissive face mesh.
logo_path='M 865.922 204.531 C 849.766 207.049, 706.298 243.352, 618.500 267.138 C 541.604 287.970, 437.143 317.770, 408 327.189 C 366.400 340.633, 329.248 373.594, 310.151 414 C 302.436 430.323, 300.472 437.536, 291.495 482.500 C 276.219 559.016, 276.675 556.273, 277.311 567.672 C 278.936 596.783, 296.952 623.071, 324.500 636.527 C 332.459 640.415, 359.802 649.931, 469.500 686.992 C 485.450 692.380, 515.093 702.461, 535.373 709.395 C 580.591 724.853, 583.385 725.159, 591.809 715.564 C 597.416 709.178, 598.021 700.427, 593.361 693.124 C 591.605 690.373, 551.264 656.674, 476.499 595.500 C 458.349 580.651, 440.440 565.387, 436.700 561.580 C 424.540 549.204, 414.174 531.326, 409.807 515.198 C 406.863 504.324, 406.890 483.775, 409.862 472.671 C 418.987 438.590, 446.414 410.743, 481.829 399.603 C 494.257 395.693, 505.793 394, 520 394 C 539.887 394, 540.953 394.227, 621.500 415.611 C 647.350 422.474, 688.075 433.281, 712 439.627 C 735.925 445.974, 800.920 463.279, 856.433 478.083 C 950.227 503.096, 957.957 505, 965.715 505 C 989.252 505, 1010.039 487.242, 1011.723 465.696 C 1012.872 450.996, 1005.719 311.264, 1002.966 294.629 C 995.368 248.714, 972.367 220.937, 931.665 208.522 C 914.164 203.184, 885.662 201.454, 865.922 204.531 M 583.500 498.933 C 579.033 500.010, 576.141 502.094, 573.693 506 C 571.529 509.453, 571.498 510.077, 571.372 552.500 C 571.302 576.150, 571.639 597.120, 572.120 599.099 C 573.944 606.594, 576.656 609.008, 594.024 618.595 C 622.913 634.542, 713.218 684.102, 721 688.280 C 737.446 697.111, 750.158 708.632, 757.842 721.673 C 783.015 764.395, 757.370 817.359, 705.301 830.180 C 694.018 832.959, 673.540 833.134, 661.500 830.554 C 657.100 829.612, 576.912 809.737, 483.305 786.388 C 389.698 763.039, 310.273 743.679, 306.805 743.367 C 284.994 741.400, 263.434 757.224, 261.426 776.673 C 261.152 779.328, 259.575 794.775, 257.923 811 C 256.270 827.225, 253.753 851.525, 252.328 865 C 249.005 896.428, 248.649 921.861, 251.370 933.500 C 257.622 960.241, 269.383 981.330, 288.260 999.645 C 318.485 1028.971, 360.807 1043.599, 405.025 1040.003 C 420.679 1038.729, 423.779 1038.170, 455 1030.986 C 469.025 1027.759, 515.150 1017.195, 557.500 1007.510 C 629.875 990.958, 748.456 963.720, 808 949.968 C 822.575 946.602, 840.125 942.563, 847 940.992 C 906.513 927.392, 914.617 924.519, 933.964 910.167 C 953.717 895.514, 967.048 876.669, 973.563 854.187 C 976.555 843.860, 988 749.598, 988 735.277 C 988 692.323, 962.327 653.484, 918.774 630.549 C 910.824 626.362, 904.345 623.717, 859 606.145 C 847.725 601.776, 832.200 595.719, 824.500 592.685 C 816.800 589.652, 788.450 578.533, 761.500 567.976 C 695.341 542.062, 650.789 524.040, 619.549 510.554 C 592.820 499.015, 588.687 497.683, 583.500 498.933'
import re
parts=re.findall(r'[MLCZ]|[-+]?\d*\.?\d+',logo_path);cursor=0;polys=[];poly=[];last=(0,0)
while cursor<len(parts):
 command=parts[cursor];cursor+=1
 if command in ('M','L'):
  point=(float(parts[cursor]),float(parts[cursor+1]));cursor+=2
  if command=='M' and poly:polys.append(poly);poly=[]
  poly.append(point);last=point
 elif command=='C':
  values=list(map(float,parts[cursor:cursor+6]));cursor+=6;p0=last;p1=values[:2];p2=values[2:4];p3=values[4:]
  for i in range(1,9):
   t=i/8;u=1-t;poly.append((u**3*p0[0]+3*u*u*t*p1[0]+3*u*t*t*p2[0]+t**3*p3[0],u**3*p0[1]+3*u*u*t*p1[1]+3*u*t*t*p2[1]+t**3*p3[1]))
  last=tuple(p3)
 elif command=='Z':
  if poly:polys.append(poly);poly=[]
if poly:polys.append(poly)
for i,points in enumerate(polys):
 verts=[Vector(((x-630)/860*.47,0,(625-z)/915*.46)) for x,z in points];tris=tessellate_polygon([verts]);idx={tuple(v):i for i,v in enumerate(verts)};faces=[tuple(v if isinstance(v,int) else idx[tuple(v)] for v in tri) for tri in tris];mesh('Slop glyph '+str(i),[(v.x,-.363+.012*(v.x*v.x+v.z*v.z),v.z) for v in verts],faces,lime,corehead)

# Crown: continuous curved band and three solid crests, seated on the shell.
crown=empty('CrownMount',(0,0,.382),corehead)
# Rounded annular enamel crown. A continuous wall with three smooth peaks,
# including the back, prevents the thin billboard silhouette from side views.
verts=[];faces=[];n=120
for i in range(n):
 a=2*pi*i/n
 h=.092+(.238+.085*max(0,cos(a))**8)*(.5+.5*cos(3*a))**1.4
 for rx,ry,z in [(.39,.222,0),(.405,.233,h),(.374,.202,h),(.36,.192,0)]:
  verts.append((sin(a)*rx,-cos(a)*ry,z))
for i in range(n):
 for j in range(4):faces.append((i*4+j,((i+1)%n)*4+j,((i+1)%n)*4+(j+1)%4,i*4+(j+1)%4))
o=mesh('Sky crown',verts,faces,blue,crown)
b=o.modifiers.new('Rounded enamel crown edge','BEVEL');b.width=.012;b.segments=3
armor('Crown base ring',[(0,.363),(.012,.392),(.028,.393),(.034,.372)],blue,crown,.57)
verts=[(0,-.243,.254),(-.058,-.243,.167),(0,-.243,.08),(.058,-.243,.167),(0,-.268,.167)]
mesh('Crown diamond',verts,[(0,1,4),(1,2,4),(2,3,4),(3,0,4)],white,crown)

joints={}
for side,name in [(-1,'Left'),(1,'Right')]:
 shoulder=empty(name+'Shoulder',(side*.30,0,1.29),body);shoulder.rotation_euler[1]=-side*.49;joints[name+'Shoulder']=shoulder
 ellipsoid(name+' recessed shoulder',(0,0,0),(.083,.091,.086),graphite,shoulder)
 armor(name+' upper arm',[( .027,.045),(.013,.077),(-.022,.1),(-.07,.105),(-.14,.105),(-.238,.078),(-.264,.064)],pearl,shoulder)
 elbow=empty(name+'Elbow',(0,0,-.285),shoulder);joints[name+'Elbow']=elbow
 ellipsoid(name+' elbow hinge',(0,0,0),(.07,.072,.07),graphite,elbow)
 armor(name+' forearm',[(-.021,.067),(-.04,.082),(-.10,.099),(-.20,.092),(-.237,.074),(-.25,.062)],pearl,elbow)
 wrist=empty(name+'Wrist',(0,0,-.258),elbow);joints[name+'Wrist']=wrist
 armor(name+' wrist collar',[(.006,.061),(-.011,.072),(-.040,.07),(-.048,.059)],graphite,wrist)
 ellipsoid(name+' blue mitten',(0,-.005,-.14),(.106,.079,.125),blue,wrist)
 ellipsoid(name+' thumb',(side*-.077,-.026,-.12),(.047,.054,.069),blue,wrist)
 hip=empty(name+'Hip',(side*.145,0,.86),body);hip.rotation_euler[1]=-side*.065;joints[name+'Hip']=hip
 ellipsoid(name+' recessed hip',(0,0,-.018),(.091,.095,.093),graphite,hip)
 armor(name+' thigh',[(-.034,.063),(-.062,.10),(-.12,.112),(-.235,.101),(-.262,.076)],pearl,hip,.95)
 knee=empty(name+'Knee',(0,0,-.279),hip);joints[name+'Knee']=knee
 ellipsoid(name+' knee hinge',(0,0,0),(.074,.082,.072),graphite,knee)
 armor(name+' shin',[(-.017,.076),(-.042,.102),(-.12,.123),(-.235,.121),(-.263,.102)],pearl,knee,.9)
 ankle=empty(name+'Ankle',(0,0,-.271),knee);joints[name+'Ankle']=ankle
 ellipsoid(name+' ankle hinge',(0,0,-.012),(.09,.085,.064),graphite,ankle)
 # Oval outsole and continuous rounded toe share the exact footprint.
 armor(name+' boot sole',[(-.223,.105),(-.218,.143),(-.196,.148),(-.18,.145)],rubber,ankle,1.36,(0,-.059,0))
 armor(name+' blue boot',[(-.181,.143),(-.163,.147),(-.132,.143),(-.092,.128),(-.05,.104),(-.026,.075),(-.014,.035),(-.011,.008)],blue,ankle,1.36,(0,-.059,0))

# Six-second breathing/hover cycle: bounded joint arcs with exact matching endpoints.
for f in range(1,181,3):
 t=(f-1)/179*2*pi
 body.location.z=.025+.026*(1-cos(t));body.rotation_euler=(.018*sin(t),.014*sin(t*.0+0),.025*sin(t))
 body.keyframe_insert('location',frame=f);body.keyframe_insert('rotation_euler',frame=f)
 neck.rotation_euler=(.022*sin(t+.3),.025*sin(t),.06*sin(t));neck.keyframe_insert('rotation_euler',frame=f)
 for side,name in [(-1,'Left'),(1,'Right')]:
  shoulder=joints[name+'Shoulder'];shoulder.rotation_euler=(-.045*sin(t),-side*(.46+.035*sin(t)),side*.025*sin(t));shoulder.keyframe_insert('rotation_euler',frame=f)
  elbow=joints[name+'Elbow'];elbow.rotation_euler[0]=-.06-.035*sin(t);elbow.keyframe_insert('rotation_euler',frame=f)
  joints[name+'Hip'].rotation_euler[0]=side*.025*sin(t);joints[name+'Hip'].keyframe_insert('rotation_euler',frame=f)
  joints[name+'Knee'].rotation_euler[0]=.028+.025*sin(t);joints[name+'Knee'].keyframe_insert('rotation_euler',frame=f)
# Copy the first keyed pose to the exact last frame for a seamless loop.
scene.frame_set(1)
for o in [body,neck,*joints.values()]:
 if o.animation_data:
  o.keyframe_insert('rotation_euler',frame=180)
  if o==body:o.keyframe_insert('location',frame=180)
scene.frame_set(1)

def light(name,loc,energy,size,color):
 d=bpy.data.lights.new(name,'AREA');d.energy=energy;d.shape='DISK';d.size=size;d.color=color;o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,1.25))-o.location).to_track_quat('-Z','Y').to_euler()
light('Key softbox',(-3,-4,5),500,4,(.96,.98,1))
light('Lavender bounce',(3,-1,2),240,3,(.73,.67,1))
light('Sky rim',(1,3,4),650,3,(.5,.78,1))
d=bpy.data.cameras.new('Character camera');cam=bpy.data.objects.new('Character camera',d);bpy.context.collection.objects.link(cam);cam.location=(.38,-5,2.2);cam.rotation_euler=(Vector((0,0,1.28))-cam.location).to_track_quat('-Z','Y').to_euler();d.type='ORTHO';d.ortho_scale=2.95;scene.camera=cam
scene.view_settings.view_transform='AgX'
result={'model':'Slop Core','reference':'Higgsfield c69e1214-098a-4dda-9cad-15591dc22e99','meshes':len([o for o in bpy.data.objects if o.type=='MESH']),'joints':list(joints),'height_m':2.55,'frame_range':[1,180]}

# Local delivery: blender -b --python tools/build-core-mesh.py -- --output /tmp/slop-core.glb
import sys
if '--' in sys.argv:
 import argparse
 args=argparse.ArgumentParser();args.add_argument('--output',required=True);options=args.parse_args(sys.argv[sys.argv.index('--')+1:])
 bpy.ops.object.select_all(action='DESELECT')
 for o in [root,*root.children_recursive]:o.select_set(True)
 scene.frame_set(1)
 bpy.ops.export_scene.gltf(filepath=options.output,export_format='GLB',use_selection=True,export_apply=True,export_animations=True,export_animation_mode='SCENE',export_frame_range=True,export_force_sampling=True)
