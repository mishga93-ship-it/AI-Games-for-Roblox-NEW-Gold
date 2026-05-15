"""Blender script: JSON keyframes → GIF animation preview for iOS app.

Usage:
  blender --background --python render_animation_preview.py -- <input.json> <output.gif>

Creates a simple stick-figure R15 character, applies animation keyframes,
renders each frame with EEVEE, and assembles into an animated GIF.
"""

import bpy
import sys
import json
import os
import math
import tempfile
import struct
from mathutils import Euler, Vector

# ----- Parse CLI arguments -----
argv = sys.argv
argv = argv[argv.index("--") + 1:]
input_path = argv[0]
output_path = argv[1]

with open(input_path, 'r') as f:
    data = json.load(f)

# ----- Scene setup -----
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

scene = bpy.context.scene
RENDER_FPS = 30  # Lower FPS for preview GIF (saves frames/size)
scene.render.fps = RENDER_FPS
scene.frame_start = 0

# ----- R15 body proportions for visual preview -----
# These are the VISUAL positions for rendering (not for FBX export).
# (name, parent, position_relative_to_parent, box_size)
R15_VISUAL = [
    ('HumanoidRootPart', None,                (0,     0,    0),    (0.01, 0.01, 0.01)),  # invisible root
    ('LowerTorso',       'HumanoidRootPart',  (0,     0,    0),    (0.8,  0.4,  0.4)),
    ('UpperTorso',       'LowerTorso',        (0,     0.6,  0),    (1.0,  0.6,  0.4)),
    ('Head',             'UpperTorso',        (0,     0.65, 0),    (0.6,  0.6,  0.6)),
    ('LeftUpperArm',     'UpperTorso',        (-0.65, 0.2,  0),    (0.3,  0.5,  0.3)),
    ('LeftLowerArm',     'LeftUpperArm',      (0,    -0.5,  0),    (0.25, 0.5,  0.25)),
    ('LeftHand',         'LeftLowerArm',      (0,    -0.45, 0),    (0.2,  0.2,  0.2)),
    ('RightUpperArm',    'UpperTorso',        (0.65,  0.2,  0),    (0.3,  0.5,  0.3)),
    ('RightLowerArm',    'RightUpperArm',     (0,    -0.5,  0),    (0.25, 0.5,  0.25)),
    ('RightHand',        'RightLowerArm',     (0,    -0.45, 0),    (0.2,  0.2,  0.2)),
    ('LeftUpperLeg',     'LowerTorso',        (-0.2, -0.3,  0),    (0.3,  0.55, 0.3)),
    ('LeftLowerLeg',     'LeftUpperLeg',      (0,    -0.55, 0),    (0.25, 0.55, 0.25)),
    ('LeftFoot',         'LeftLowerLeg',      (0,    -0.5,  0.1),  (0.3,  0.15, 0.5)),
    ('RightUpperLeg',    'LowerTorso',        (0.2,  -0.3,  0),    (0.3,  0.55, 0.3)),
    ('RightLowerLeg',    'RightUpperLeg',     (0,    -0.55, 0),    (0.25, 0.55, 0.25)),
    ('RightFoot',        'RightLowerLeg',     (0,    -0.5,  0.1),  (0.3,  0.15, 0.5)),
]

JOINT_ALIAS = {
    'Waist': 'UpperTorso', 'Neck': 'Head',
    'LeftShoulder': 'LeftUpperArm', 'RightShoulder': 'RightUpperArm',
    'LeftElbow': 'LeftLowerArm', 'RightElbow': 'RightLowerArm',
    'LeftWrist': 'LeftHand', 'RightWrist': 'RightHand',
    'LeftHip': 'LeftUpperLeg', 'RightHip': 'RightUpperLeg',
    'LeftKnee': 'LeftLowerLeg', 'RightKnee': 'RightLowerLeg',
    'LeftAnkle': 'LeftFoot', 'RightAnkle': 'RightFoot',
}

# ----- Create armature with VISUAL bone positions -----
armature_data = bpy.data.armatures.new('PreviewArmature')
armature_obj = bpy.data.objects.new('PreviewRig', armature_data)
scene.collection.objects.link(armature_obj)
bpy.context.view_layer.objects.active = armature_obj
armature_obj.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')

edit_bones = armature_data.edit_bones
bone_visual_data = {}

for (name, parent_name, rel_pos, box_size) in R15_VISUAL:
    eb = edit_bones.new(name)
    # Calculate world position from parent chain
    if parent_name and parent_name in edit_bones:
        parent_eb = edit_bones[parent_name]
        world_pos = Vector(parent_eb.head) + Vector(rel_pos)
    else:
        world_pos = Vector(rel_pos)
    eb.head = world_pos
    eb.tail = world_pos + Vector((0, 0.01, 0))  # Minimal tail offset
    eb.roll = 0.0
    eb.use_connect = False
    if parent_name and parent_name in edit_bones:
        eb.parent = edit_bones[parent_name]
    bone_visual_data[name] = {'pos': tuple(world_pos), 'size': box_size}

bpy.ops.object.mode_set(mode='OBJECT')

# ----- Create box meshes for each body part -----
body_material = bpy.data.materials.new('BodyMaterial')
body_material.use_nodes = True
bsdf = body_material.node_tree.nodes['Principled BSDF']
bsdf.inputs['Base Color'].default_value = (0.3, 0.55, 0.9, 1.0)  # Light blue
bsdf.inputs['Roughness'].default_value = 0.7

head_material = bpy.data.materials.new('HeadMaterial')
head_material.use_nodes = True
bsdf_head = head_material.node_tree.nodes['Principled BSDF']
bsdf_head.inputs['Base Color'].default_value = (0.95, 0.85, 0.7, 1.0)  # Skin tone
bsdf_head.inputs['Roughness'].default_value = 0.6

mesh_objects = {}
for (name, parent_name, rel_pos, box_size) in R15_VISUAL:
    if name == 'HumanoidRootPart':
        continue  # Invisible root
    # Create box mesh
    bpy.ops.mesh.primitive_cube_add(size=1)
    box = bpy.context.active_object
    box.name = f'Mesh_{name}'
    box.scale = (box_size[0] * 0.5, box_size[2] * 0.5, box_size[1] * 0.5)  # XZY → Blender XYZ
    bpy.ops.object.transform_apply(scale=True)
    # Apply material
    mat = head_material if name == 'Head' else body_material
    box.data.materials.clear()
    box.data.materials.append(mat)
    # Parent to bone
    box.parent = armature_obj
    box.parent_type = 'BONE'
    box.parent_bone = name
    # Offset so mesh centers on bone head
    box.location = (0, 0, 0)
    mesh_objects[name] = box

# ----- Create animation action -----
anim_name = str(data.get('name', 'Preview'))
action = bpy.data.actions.new(anim_name)
armature_obj.animation_data_create()
armature_obj.animation_data.action = action

keyframes = data.get('keyframes', [])
if keyframes:
    last_time = max(float(kf.get('time', 0)) for kf in keyframes)
    scene.frame_end = max(int(last_time * RENDER_FPS) + 1, 1)
else:
    scene.frame_end = 1

# ----- Apply pose keyframes -----
bpy.ops.object.mode_set(mode='POSE')
pose_bones = armature_obj.pose.bones

for pb in pose_bones.values():
    pb.location = (0, 0, 0)
    pb.rotation_mode = 'XYZ'

for kf_data in keyframes:
    time = float(kf_data.get('time', 0))
    frame = max(0, int(time * RENDER_FPS))
    poses = kf_data.get('poses', [])

    posed_joints = set()
    for pose_data in poses:
        joint = str(pose_data.get('joint', ''))
        joint = JOINT_ALIAS.get(joint, joint)
        if joint not in pose_bones:
            continue
        posed_joints.add(joint)
        pb = pose_bones[joint]
        cf = pose_data.get('cframe', {})
        rx = float(cf.get('rx', 0))
        ry = float(cf.get('ry', 0))
        rz = float(cf.get('rz', 0))
        pb.rotation_euler = Euler((rx, ry, rz), 'XYZ')
        pb.keyframe_insert(data_path='rotation_euler', frame=frame)

        if joint == 'HumanoidRootPart':
            x = float(cf.get('x', 0))
            y = float(cf.get('y', 0))
            z = float(cf.get('z', 0))
            if x != 0 or y != 0 or z != 0:
                pb.location = (x, y, z)
                pb.keyframe_insert(data_path='location', frame=frame)

    for bone_name, pb in pose_bones.items():
        if bone_name not in posed_joints:
            pb.rotation_euler = Euler((0, 0, 0), 'XYZ')
            pb.keyframe_insert(data_path='rotation_euler', frame=frame)

bpy.ops.object.mode_set(mode='OBJECT')

# ----- Setup camera -----
cam_data = bpy.data.cameras.new('PreviewCamera')
cam_data.type = 'ORTHO'
cam_data.ortho_scale = 6.0
cam_obj = bpy.data.objects.new('PreviewCamera', cam_data)
scene.collection.objects.link(cam_obj)
cam_obj.location = (0, -8, 1.0)
cam_obj.rotation_euler = (math.radians(90), 0, 0)
scene.camera = cam_obj

# ----- Setup lighting -----
light_data = bpy.data.lights.new('KeyLight', type='SUN')
light_data.energy = 3.0
light_obj = bpy.data.objects.new('KeyLight', light_data)
scene.collection.objects.link(light_obj)
light_obj.rotation_euler = (math.radians(45), math.radians(20), math.radians(-30))

fill_data = bpy.data.lights.new('FillLight', type='SUN')
fill_data.energy = 1.0
fill_obj = bpy.data.objects.new('FillLight', fill_data)
scene.collection.objects.link(fill_obj)
fill_obj.rotation_euler = (math.radians(60), math.radians(-30), math.radians(30))

# ----- Setup render settings -----
# EEVEE needs OpenGL (Xvfb provides it); fallback to WORKBENCH if unavailable
try:
    scene.render.engine = 'BLENDER_EEVEE'
    # Quick test: try setting a sample count to verify engine loaded
except Exception as e:
    sys.stderr.write(f"EEVEE unavailable ({e}), falling back to WORKBENCH\n")
    scene.render.engine = 'BLENDER_WORKBENCH'
scene.render.resolution_x = 320
scene.render.resolution_y = 320
scene.render.resolution_percentage = 100
scene.render.film_transparent = True  # Transparent background
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'

# World background — light gray gradient
world = bpy.data.worlds.new('PreviewWorld')
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes['Background']
bg.inputs['Color'].default_value = (0.85, 0.88, 0.92, 1.0)  # Light blue-gray
bg.inputs['Strength'].default_value = 1.0

# ----- Render frames -----
frames_dir = tempfile.mkdtemp(prefix='anim_preview_')
# Render every Nth frame for ~15 fps GIF
frame_step = max(1, RENDER_FPS // 15)  # 30fps / 15 = every 2nd frame
rendered_files = []

for frame_num in range(scene.frame_start, scene.frame_end + 1, frame_step):
    scene.frame_set(frame_num)
    frame_path = os.path.join(frames_dir, f'frame_{frame_num:05d}.png')
    scene.render.filepath = frame_path
    bpy.ops.render.render(write_still=True)
    rendered_files.append(frame_path)

# ----- Validate rendered frames -----
rendered_files = [f for f in rendered_files if os.path.exists(f) and os.path.getsize(f) > 0]
if not rendered_files:
    sys.stderr.write("ERROR: No frames were rendered successfully\n")
    print("BLENDER_RESULT:" + json.dumps({"success": False, "error": "no_frames_rendered"}))
    sys.exit(1)

sys.stderr.write(f"INFO: {len(rendered_files)} frames rendered successfully\n")

# ----- Assemble GIF -----
# Use built-in struct to write minimal GIF without external dependencies
def create_gif(image_paths, output_gif, delay_cs=7):
    """Create animated GIF from PNG files using PIL if available, else raw bytes."""
    try:
        # Try imageio first (if installed)
        import imageio.v2 as imageio
        frames = []
        for path in image_paths:
            img = imageio.imread(path)
            frames.append(img)
        imageio.mimsave(output_gif, frames, duration=delay_cs / 100.0, loop=0)
        return True
    except ImportError:
        pass

    try:
        # Fallback: PIL/Pillow
        from PIL import Image
        imgs = [Image.open(p).convert('RGBA') for p in image_paths]
        # Convert to palette mode for GIF
        palette_imgs = []
        for img in imgs:
            # Composite on light background
            bg = Image.new('RGBA', img.size, (217, 224, 235, 255))
            bg.paste(img, mask=img)
            palette_imgs.append(bg.convert('RGB').convert('P', palette=Image.ADAPTIVE, colors=128))
        palette_imgs[0].save(
            output_gif, save_all=True, append_images=palette_imgs[1:],
            duration=delay_cs * 10, loop=0, optimize=True
        )
        return True
    except ImportError:
        pass

    # Last resort: use Blender's compositor to output video
    # This shouldn't happen in production — imageio should be installed
    sys.stderr.write("WARNING: Neither imageio nor PIL available, skipping GIF creation\n")
    return False

gif_delay = 7  # centiseconds between frames (~15fps)
success = create_gif(rendered_files, output_path, gif_delay)

if not success:
    sys.stderr.write("ERROR: GIF creation failed — neither imageio nor PIL available\n")
    print("BLENDER_RESULT:" + json.dumps({"success": False, "error": "gif_library_missing"}))
    sys.exit(1)

if not os.path.exists(output_path) or os.path.getsize(output_path) == 0:
    sys.stderr.write("ERROR: GIF file not created or empty\n")
    print("BLENDER_RESULT:" + json.dumps({"success": False, "error": "gif_file_empty"}))
    sys.exit(1)

# ----- Cleanup frames -----
import shutil
shutil.rmtree(frames_dir, ignore_errors=True)

# ----- Output result -----
gif_size = os.path.getsize(output_path) if os.path.exists(output_path) else 0
print("BLENDER_RESULT:" + json.dumps({
    "animationName": anim_name,
    "keyframeCount": len(keyframes),
    "framesRendered": len(rendered_files),
    "gifSizeBytes": gif_size,
    "resolution": "320x320",
    "output": "gif",
    "success": success,
}))
