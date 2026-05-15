"""
Blender background script for automatic R15 rigging.

Usage:
  blender --background --python auto_rig_r15.py -- <input> <output>

Imports a mesh, creates an R15-compatible armature proportioned to
the mesh bounding box, performs automatic weight painting, and exports
the rigged result. FBX output uses Roblox-compatible flags so the
Open Cloud Assets API ingests it as a skinned MeshPart with Bones.

Outputs a JSON stats line prefixed with BLENDER_RESULT: on stdout.
"""

import bpy
import sys
import json
from mathutils import Vector

argv = sys.argv
argv = argv[argv.index("--") + 1:]

input_path = argv[0]
output_path = argv[1]

# Roblox skinned MeshPart vertex cap. Higher counts trigger silent rejection
# from the importer, so decimate aggressively if needed.
MAX_VERTICES = 8000

# ── Clear default scene ──────────────────────────────────────────────
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

# ── Import ────────────────────────────────────────────────────────────
ext = input_path.rsplit('.', 1)[-1].lower()
if ext in ('glb', 'gltf'):
    bpy.ops.import_scene.gltf(filepath=input_path)
elif ext == 'fbx':
    bpy.ops.import_scene.fbx(filepath=input_path)
elif ext == 'obj':
    bpy.ops.wm.obj_import(filepath=input_path)
else:
    raise RuntimeError(f"Unsupported mesh format: .{ext}")

mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
if not mesh_objects:
    raise RuntimeError("No mesh objects found in the imported file")

# ── Mesh repair pre-pass ──────────────────────────────────────────────
# Hunyuan3D / Meshy outputs are often non-manifold or have duplicate
# vertices. ARMATURE_AUTO weighting silently produces zero weights on
# such meshes, so we clean up first.
pre_pass_stats = {"holes_filled": 0, "doubles_removed": 0, "decimated": False}

for obj in mesh_objects:
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    try:
        bpy.ops.mesh.remove_doubles(threshold=0.0001)
        pre_pass_stats["doubles_removed"] += 1
    except RuntimeError:
        pass
    try:
        bpy.ops.mesh.fill_holes(sides=8)
        pre_pass_stats["holes_filled"] += 1
    except RuntimeError:
        pass
    bpy.ops.object.mode_set(mode='OBJECT')

# Decimate if total vertex count exceeds Roblox cap
total_vertex_count = sum(len(o.data.vertices) for o in mesh_objects)
if total_vertex_count > MAX_VERTICES:
    decimate_ratio = MAX_VERTICES / float(total_vertex_count)
    for obj in mesh_objects:
        mod = obj.modifiers.new(name="DecimateForRoblox", type='DECIMATE')
        mod.ratio = decimate_ratio
        bpy.context.view_layer.objects.active = obj
        try:
            bpy.ops.object.modifier_apply(modifier=mod.name)
            pre_pass_stats["decimated"] = True
        except RuntimeError:
            obj.modifiers.remove(mod)

# Recompute mesh objects in case some were merged/replaced
mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']

# ── Compute bounding box across all meshes ────────────────────────────
all_verts = []
for obj in mesh_objects:
    for v in obj.data.vertices:
        all_verts.append(obj.matrix_world @ v.co)

min_co = Vector((
    min(v.x for v in all_verts),
    min(v.y for v in all_verts),
    min(v.z for v in all_verts),
))
max_co = Vector((
    max(v.x for v in all_verts),
    max(v.y for v in all_verts),
    max(v.z for v in all_verts),
))
center = (min_co + max_co) / 2
height = max_co.z - min_co.z
width = max_co.x - min_co.x

if height < 0.01:
    raise RuntimeError("Mesh has near-zero height; cannot generate rig")

# ── Normalize mesh to R15 target height (changelog-312, Stage B follow-up) ──
# Meshy / Tripo / Hyper3D outputs raw meshes at 100-1000x R15 scale (e.g. 191
# or 549 stud height in worst cases). We bake a uniform downscale into the
# mesh geometry HERE — before bone layout — so:
#   1. Bones get computed against R15-matching bounding box → proper R15 proportions
#   2. FBX exports at correct scale → Open Cloud receives mesh with intrinsic
#      scale ~5.9 stud → static MeshPart in RBXM is correctly sized in Studio Edit
#   3. No runtime Model:ScaleTo needed at Play (which doesn't work on static
#      MeshPart anyway because Bone Instances aren't auto-instantiated for assets
#      loaded via numeric MeshId — only via FBX importer / InsertService:LoadAsset)
# Target height matches NPC_MESH_TARGET_HEIGHT_STUDS in apps/functions/src/robloxWorker.ts.
# 2026-05-13 update: Engine API reports sizeY=5.9 but Studio visually renders the
# skinned mesh ~2x bigger (~12 stud). For modern MeshContent property on a skinned
# MeshPart, Studio appears to apply an additional ~2x scale via FBX unit
# interpretation that Engine API doesn't apply when reading raw MeshPart.Size.
# Empirical fix: target half the visual R15 height in Blender pre-scale; final
# Studio render comes out at ~5-6 stud.
TARGET_HEIGHT_STUDS = 2.95
# Only rescale when off by more than 0.5 stud — avoids needless transform on
# meshes that are already close to R15 size.
if abs(height - TARGET_HEIGHT_STUDS) > 0.5:
    scale_factor = TARGET_HEIGHT_STUDS / height
    print(f"INFO: pre-scaling mesh by {scale_factor:.6f} (from {height:.2f} stud to {TARGET_HEIGHT_STUDS} stud target)")
    # Apply uniform scale to every mesh object, then bake into geometry so
    # the change persists through skinning + FBX export (FBX 'global_scale'
    # has inconsistent behavior across importers including Roblox, baking is
    # the only reliable path).
    bpy.ops.object.select_all(action='DESELECT')
    for obj in mesh_objects:
        obj.select_set(True)
        obj.scale = (scale_factor, scale_factor, scale_factor)
    bpy.context.view_layer.objects.active = mesh_objects[0]
    # Apply scale into vertex coordinates. location/rotation untouched so the
    # mesh stays at origin. After this, obj.scale resets to (1,1,1) and the
    # vertex positions reflect the scaled geometry.
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    # Recompute bounding box now that geometry has been scaled — bone layout
    # below uses these (rescaled) min_co/max_co/center/height/width values.
    all_verts = []
    for obj in mesh_objects:
        for v in obj.data.vertices:
            all_verts.append(obj.matrix_world @ v.co)
    min_co = Vector((
        min(v.x for v in all_verts),
        min(v.y for v in all_verts),
        min(v.z for v in all_verts),
    ))
    max_co = Vector((
        max(v.x for v in all_verts),
        max(v.y for v in all_verts),
        max(v.z for v in all_verts),
    ))
    center = (min_co + max_co) / 2
    height = max_co.z - min_co.z
    width = max_co.x - min_co.x
    print(f"INFO: post-scale bbox: height={height:.3f} width={width:.3f}")
else:
    print(f"INFO: mesh already near R15 height ({height:.2f} stud), skipping pre-scale")

# ── R15 bone layout (proportional to character bounding box) ──────────
# Roblox R15 has 15 body parts + HumanoidRootPart
BONES = {
    "HumanoidRootPart": {
        "head": (center.x, center.y, min_co.z + height * 0.40),
        "tail": (center.x, center.y, min_co.z + height * 0.45),
    },
    "LowerTorso": {
        "head": (center.x, center.y, min_co.z + height * 0.35),
        "tail": (center.x, center.y, min_co.z + height * 0.45),
    },
    "UpperTorso": {
        "head": (center.x, center.y, min_co.z + height * 0.45),
        "tail": (center.x, center.y, min_co.z + height * 0.65),
    },
    "Head": {
        "head": (center.x, center.y, min_co.z + height * 0.75),
        "tail": (center.x, center.y, min_co.z + height * 0.95),
    },
    "LeftUpperArm": {
        "head": (center.x - width * 0.30, center.y, min_co.z + height * 0.65),
        "tail": (center.x - width * 0.40, center.y, min_co.z + height * 0.50),
    },
    "LeftLowerArm": {
        "head": (center.x - width * 0.40, center.y, min_co.z + height * 0.50),
        "tail": (center.x - width * 0.45, center.y, min_co.z + height * 0.35),
    },
    "LeftHand": {
        "head": (center.x - width * 0.45, center.y, min_co.z + height * 0.35),
        "tail": (center.x - width * 0.50, center.y, min_co.z + height * 0.28),
    },
    "RightUpperArm": {
        "head": (center.x + width * 0.30, center.y, min_co.z + height * 0.65),
        "tail": (center.x + width * 0.40, center.y, min_co.z + height * 0.50),
    },
    "RightLowerArm": {
        "head": (center.x + width * 0.40, center.y, min_co.z + height * 0.50),
        "tail": (center.x + width * 0.45, center.y, min_co.z + height * 0.35),
    },
    "RightHand": {
        "head": (center.x + width * 0.45, center.y, min_co.z + height * 0.35),
        "tail": (center.x + width * 0.50, center.y, min_co.z + height * 0.28),
    },
    "LeftUpperLeg": {
        "head": (center.x - width * 0.12, center.y, min_co.z + height * 0.35),
        "tail": (center.x - width * 0.12, center.y, min_co.z + height * 0.20),
    },
    "LeftLowerLeg": {
        "head": (center.x - width * 0.12, center.y, min_co.z + height * 0.20),
        "tail": (center.x - width * 0.12, center.y, min_co.z + height * 0.05),
    },
    "LeftFoot": {
        "head": (center.x - width * 0.12, center.y, min_co.z + height * 0.05),
        "tail": (center.x - width * 0.12, center.y + height * 0.08, min_co.z),
    },
    "RightUpperLeg": {
        "head": (center.x + width * 0.12, center.y, min_co.z + height * 0.35),
        "tail": (center.x + width * 0.12, center.y, min_co.z + height * 0.20),
    },
    "RightLowerLeg": {
        "head": (center.x + width * 0.12, center.y, min_co.z + height * 0.20),
        "tail": (center.x + width * 0.12, center.y, min_co.z + height * 0.05),
    },
    "RightFoot": {
        "head": (center.x + width * 0.12, center.y, min_co.z + height * 0.05),
        "tail": (center.x + width * 0.12, center.y + height * 0.08, min_co.z),
    },
}

PARENT_MAP = {
    "LowerTorso": "HumanoidRootPart",
    "UpperTorso": "LowerTorso",
    "Head": "UpperTorso",
    "LeftUpperArm": "UpperTorso",
    "LeftLowerArm": "LeftUpperArm",
    "LeftHand": "LeftLowerArm",
    "RightUpperArm": "UpperTorso",
    "RightLowerArm": "RightUpperArm",
    "RightHand": "RightLowerArm",
    "LeftUpperLeg": "LowerTorso",
    "LeftLowerLeg": "LeftUpperLeg",
    "LeftFoot": "LeftLowerLeg",
    "RightUpperLeg": "LowerTorso",
    "RightLowerLeg": "RightUpperLeg",
    "RightFoot": "RightLowerLeg",
}

# ── Create armature ──────────────────────────────────────────────────
bpy.ops.object.armature_add(enter_editmode=True, location=(0, 0, 0))
armature_obj = bpy.context.active_object
armature_obj.name = "R15_Armature"
armature = armature_obj.data
armature.name = "R15"

# Remove the default bone created by armature_add
for b in list(armature.edit_bones):
    armature.edit_bones.remove(b)

edit_bones = {}
for name, pos in BONES.items():
    bone = armature.edit_bones.new(name)
    bone.head = pos["head"]
    bone.tail = pos["tail"]
    edit_bones[name] = bone

for child_name, parent_name in PARENT_MAP.items():
    if child_name in edit_bones and parent_name in edit_bones:
        edit_bones[child_name].parent = edit_bones[parent_name]
        edit_bones[child_name].use_connect = False

bpy.ops.object.mode_set(mode='OBJECT')

# ── Parent meshes to armature with automatic weights ──────────────────
bpy.ops.object.select_all(action='DESELECT')
for obj in mesh_objects:
    obj.select_set(True)
armature_obj.select_set(True)
bpy.context.view_layer.objects.active = armature_obj

weight_method = "auto"
try:
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
except RuntimeError:
    weight_method = "envelope"
    try:
        bpy.ops.object.parent_set(type='ARMATURE_ENVELOPE')
    except RuntimeError:
        # Last resort: ARMATURE_NAME (no weights, just parents).
        # Mesh will not deform but at least exports with armature.
        weight_method = "name_only"
        bpy.ops.object.parent_set(type='ARMATURE_NAME')

# ── Validate skin weights ─────────────────────────────────────────────
# Roblox importer silently rejects bones with zero weighted vertices.
# We count how many vertices each bone influences so the worker can
# warn or fall back to welded_visual if skinning is degenerate.
unweighted_bones = []
weighted_bone_counts = {}
for bone_name in BONES.keys():
    influenced_verts = 0
    for obj in mesh_objects:
        vg = obj.vertex_groups.get(bone_name)
        if vg is None:
            continue
        for v in obj.data.vertices:
            for g in v.groups:
                if g.group == vg.index and g.weight > 0.001:
                    influenced_verts += 1
                    break
    weighted_bone_counts[bone_name] = influenced_verts
    if influenced_verts == 0:
        unweighted_bones.append(bone_name)

skin_quality = "good"
if len(unweighted_bones) > 5:
    skin_quality = "degraded"
if len(unweighted_bones) > 10 or weight_method == "name_only":
    skin_quality = "broken"

# ── Export ────────────────────────────────────────────────────────────
out_ext = output_path.rsplit('.', 1)[-1].lower()
bpy.ops.object.select_all(action='SELECT')


def export_glb(path):
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True,
        export_materials='EXPORT', export_texcoords=True,
        export_normals=True, export_colors=True,
    )


def export_fbx(path):
    # Roblox-compatible FBX export. The Open Cloud importer expects
    # Y-up, no leaf bones, embedded textures, and armature-deform-only
    # bones. Without these flags the import either fails silently or
    # produces a static MeshPart without skinning data.
    #
    # global_scale=0.01 compensates for apply_unit_scale=True's m→cm
    # conversion (which multiplies all values by 100). Without it, a 5.9-BU
    # mesh exports as 590 in FBX and Roblox imports as 590-stud-tall
    # MeshPart (changelog-312 test 5 root cause). With global_scale=0.01:
    # 5.9 BU × 100 (apply_unit_scale) × 0.01 (global_scale) = 5.9 in FBX
    # → Roblox imports as 5.9 stud, matching pre-scale target.
    bpy.ops.export_scene.fbx(
        filepath=path,
        use_selection=True,
        add_leaf_bones=False,
        bake_anim=False,
        mesh_smooth_type='FACE',
        use_armature_deform_only=True,
        armature_nodetype='NULL',
        path_mode='COPY',
        embed_textures=True,
        axis_forward='-Z',
        axis_up='Y',
        global_scale=0.01,
        apply_unit_scale=True,
        bake_space_transform=True,
    )


try:
    if out_ext == 'fbx':
        export_fbx(output_path)
    else:
        export_glb(output_path)
except Exception as e:
    # GLB exporter can crash on add_neutral_bones() with certain armatures.
    # Fallback: remove armature and export mesh-only (better than no output).
    import traceback
    traceback.print_exc()
    print(f"WARN: Export with armature failed ({e}), retrying mesh-only export")
    bpy.ops.object.select_all(action='DESELECT')
    for obj in list(bpy.context.scene.objects):
        if obj.type == 'ARMATURE':
            obj.select_set(True)
    bpy.ops.object.delete(use_global=False)
    bpy.ops.object.select_all(action='SELECT')
    if out_ext == 'fbx':
        export_fbx(output_path)
    else:
        export_glb(output_path)

print("BLENDER_RESULT:" + json.dumps({
    "bones": list(BONES.keys()),
    "bone_count": len(BONES),
    "mesh_count": len(mesh_objects),
    "height": round(height, 4),
    "width": round(width, 4),
    "vertex_count": total_vertex_count,
    "output_format": out_ext,
    "weight_method": weight_method,
    "weighted_bone_counts": weighted_bone_counts,
    "unweighted_bones": unweighted_bones,
    "skin_quality": skin_quality,
    "pre_pass": pre_pass_stats,
}))
