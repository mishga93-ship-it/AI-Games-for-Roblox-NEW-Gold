"""Blender script: JSON keyframes → FBX animation for Roblox R15.

Usage:
  blender --background --python keyframes_to_fbx.py -- <input.json> <output.fbx>

Input JSON format:
{
  "name": "MyAnimation",
  "looped": true,
  "keyframes": [
    { "time": 0.0, "poses": [
      { "joint": "LowerTorso", "cframe": { "x": 0, "y": 0, "z": 0, "rx": 0, "ry": 0, "rz": 0 } }
    ]}
  ]
}

The cframe rx/ry/rz are Euler angles in radians (XYZ intrinsic, matching Roblox Motor6D).
Outputs an FBX with a named R15 armature and animation curves.

IMPORTANT: All bones are placed at origin (0,0,0) with tail pointing up (0,0.01,0).
This ensures ZERO rest-pose rotation/position in the FBX — Roblox only receives
animation delta data. The actual bone positions are on the Roblox R15 rig itself.
"""

import bpy
import sys
import json
import math
from mathutils import Euler

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
FPS = 60
scene.render.fps = FPS
scene.frame_start = 0

# ----- R15 armature definition -----
# ALL bones at origin with tail pointing up. This produces zero Lcl Rotation
# and zero Lcl Translation in the FBX rest pose. Roblox maps animation curves
# by bone NAME to its own R15 rig, so spatial positions here don't matter —
# only the hierarchy and animation rotation data matter.
# (name, parent)
R15_BONES = [
    ('HumanoidRootPart', None),
    ('LowerTorso',       'HumanoidRootPart'),
    ('UpperTorso',       'LowerTorso'),
    ('Head',             'UpperTorso'),
    ('LeftUpperArm',     'UpperTorso'),
    ('LeftLowerArm',     'LeftUpperArm'),
    ('LeftHand',         'LeftLowerArm'),
    ('RightUpperArm',    'UpperTorso'),
    ('RightLowerArm',    'RightUpperArm'),
    ('RightHand',        'RightLowerArm'),
    ('LeftUpperLeg',     'LowerTorso'),
    ('LeftLowerLeg',     'LeftUpperLeg'),
    ('LeftFoot',         'LeftLowerLeg'),
    ('RightUpperLeg',    'LowerTorso'),
    ('RightLowerLeg',    'RightUpperLeg'),
    ('RightFoot',        'RightLowerLeg'),
]

# ----- Create armature -----
armature_data = bpy.data.armatures.new('R15Armature')
armature_obj = bpy.data.objects.new('R15Rig', armature_data)
scene.collection.objects.link(armature_obj)
bpy.context.view_layer.objects.active = armature_obj
armature_obj.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')

edit_bones = armature_data.edit_bones
# Small Y offsets per bone index to avoid zero-length bones overlapping
for i, (name, parent_name) in enumerate(R15_BONES):
    eb = edit_bones.new(name)
    # All bones at origin, tiny unique Y offset for tail to avoid degenerate bones
    y_off = 0.01 * (i + 1)
    eb.head = (0, 0, 0)
    eb.tail = (0, y_off, 0)
    eb.roll = 0.0
    eb.use_connect = False
    if parent_name and parent_name in edit_bones:
        eb.parent = edit_bones[parent_name]

bpy.ops.object.mode_set(mode='OBJECT')

# ----- Create animation action -----
anim_name = str(data.get('name', 'R15Animation'))
action = bpy.data.actions.new(anim_name)
armature_obj.animation_data_create()
armature_obj.animation_data.action = action

keyframes = data.get('keyframes', [])
if keyframes:
    last_time = max(float(kf.get('time', 0)) for kf in keyframes)
    scene.frame_end = max(int(last_time * FPS) + 1, 1)
else:
    scene.frame_end = 1

# ----- Joint name mapping (Motor6D names → Part/bone names) -----
JOINT_ALIAS = {
    'Waist': 'UpperTorso',
    'Neck': 'Head',
    'LeftShoulder': 'LeftUpperArm',
    'RightShoulder': 'RightUpperArm',
    'LeftElbow': 'LeftLowerArm',
    'RightElbow': 'RightLowerArm',
    'LeftWrist': 'LeftHand',
    'RightWrist': 'RightHand',
    'LeftHip': 'LeftUpperLeg',
    'RightHip': 'RightUpperLeg',
    'LeftKnee': 'LeftLowerLeg',
    'RightKnee': 'RightLowerLeg',
    'LeftAnkle': 'LeftFoot',
    'RightAnkle': 'RightFoot',
}

# ----- Apply pose keyframes -----
bpy.ops.object.mode_set(mode='POSE')
pose_bones = armature_obj.pose.bones
skipped_joints = []
applied_count = 0

# Ensure all bones start with zero location
for pb in pose_bones.values():
    pb.location = (0, 0, 0)
    pb.rotation_mode = 'XYZ'

for kf_data in keyframes:
    time = float(kf_data.get('time', 0))
    frame = max(0, int(time * FPS))
    poses = kf_data.get('poses', [])

    # Collect which joints are explicitly set in this keyframe
    posed_joints = set()
    for pose_data in poses:
        joint = str(pose_data.get('joint', ''))
        joint = JOINT_ALIAS.get(joint, joint)  # map Motor6D name → Part name
        if joint not in pose_bones:
            sys.stderr.write(f"WARNING: joint '{joint}' not found in pose_bones, skipping\n")
            skipped_joints.append(joint)
            continue
        posed_joints.add(joint)
        pb = pose_bones[joint]
        cf = pose_data.get('cframe', {})
        rx = float(cf.get('rx', 0))
        ry = float(cf.get('ry', 0))
        rz = float(cf.get('rz', 0))
        # Roblox Euler order: XYZ intrinsic
        pb.rotation_euler = Euler((rx, ry, rz), 'XYZ')
        pb.keyframe_insert(data_path='rotation_euler', frame=frame)

        # Position offsets ONLY for HumanoidRootPart (jumps, dashes)
        if joint == 'HumanoidRootPart':
            x = float(cf.get('x', 0))
            y = float(cf.get('y', 0))
            z = float(cf.get('z', 0))
            if x != 0 or y != 0 or z != 0:
                pb.location = (x, y, z)
                pb.keyframe_insert(data_path='location', frame=frame)

        applied_count += 1

    # Reset un-mentioned joints to rest rotation at this keyframe
    for bone_name, pb in pose_bones.items():
        if bone_name not in posed_joints:
            pb.rotation_euler = Euler((0, 0, 0), 'XYZ')
            pb.keyframe_insert(data_path='rotation_euler', frame=frame)

bpy.ops.object.mode_set(mode='OBJECT')

# ----- Export FBX -----
bpy.ops.object.select_all(action='DESELECT')
armature_obj.select_set(True)
bpy.context.view_layer.objects.active = armature_obj

bpy.ops.export_scene.fbx(
    filepath=output_path,
    use_selection=True,
    apply_scale_options='FBX_SCALE_UNITS',
    bake_anim=True,                              # Must bake for animation export
    bake_anim_use_all_actions=False,              # Only current action
    bake_anim_use_nla_strips=False,
    bake_anim_step=1.0,
    bake_anim_simplify_factor=0.0,
    bake_anim_force_startend_keying=False,        # Don't force start/end keys
    add_leaf_bones=False,
    axis_forward='-Z',
    axis_up='Y',
    object_types={'ARMATURE'},
    path_mode='STRIP',
)

print("BLENDER_RESULT:" + json.dumps({
    "animationName": anim_name,
    "keyframeCount": len(keyframes),
    "frameEnd": scene.frame_end,
    "fps": FPS,
    "output": "fbx",
    "appliedPoses": applied_count,
    "skippedJoints": list(set(skipped_joints)),
}))
