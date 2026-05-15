"""
Blender background script for GLB to FBX conversion.

Usage:
  blender --background --python glb_to_fbx.py -- <input.glb> <output.fbx>

Imports a GLB/glTF file, selects all objects, and exports as FBX
with scale suitable for Roblox Studio Avatar Auto Setup.

Outputs a JSON stats line prefixed with BLENDER_RESULT: on stdout.
"""

import bpy
import sys
import json

argv = sys.argv
argv = argv[argv.index("--") + 1:]

input_path = argv[0]
output_path = argv[1]

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

ext = input_path.rsplit('.', 1)[-1].lower()
if ext in ('glb', 'gltf'):
    bpy.ops.import_scene.gltf(filepath=input_path)
elif ext == 'obj':
    bpy.ops.wm.obj_import(filepath=input_path)
elif ext == 'fbx':
    bpy.ops.import_scene.fbx(filepath=input_path)
else:
    bpy.ops.import_scene.gltf(filepath=input_path)

import bmesh
from mathutils import Vector

TARGET_HEIGHT = 5.5  # Roblox studs
OUTLIER_DISTANCE_FACTOR = 5.0  # vertices farther than 5x avg distance from center are removed

mesh_count = 0
vert_count = 0
for obj in bpy.context.scene.objects:
    obj.select_set(True)
    if obj.type == 'MESH' and obj.data:
        mesh_count += 1
        vert_count += len(obj.data.vertices)

if bpy.context.selected_objects:
    bpy.context.view_layer.objects.active = bpy.context.selected_objects[0]
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

# --- Mesh cleanup: remove loose geometry and outlier vertices ---
for obj in list(bpy.context.scene.objects):
    if obj.type != 'MESH' or not obj.data:
        continue

    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(obj.data)

    # Remove loose vertices (not connected to any face)
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context='VERTS')

    # Remove degenerate faces (zero area)
    bmesh.ops.dissolve_degenerate(bm, dist=0.0001, edges=bm.edges[:])

    # Fill boundary holes (edges with only one adjacent face)
    boundary = [e for e in bm.edges if e.is_boundary]
    if boundary:
        bmesh.ops.holes_fill(bm, edges=boundary, sides=8)

    # Outlier vertex removal DISABLED — on AI-generated meshes it removes
    # hair spikes, extended arms, weapons, accessories and creates new holes.
    # The loose-vertex removal + dissolve_degenerate above are sufficient cleanup.

    bmesh.update_edit_mesh(obj.data)
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT')

# --- Compute bounding box after cleanup ---
min_co = Vector((float('inf'), float('inf'), float('inf')))
max_co = Vector((float('-inf'), float('-inf'), float('-inf')))
for obj in bpy.context.scene.objects:
    if obj.type != 'MESH' or not obj.data:
        continue
    for v in obj.data.vertices:
        wc = obj.matrix_world @ v.co
        min_co = Vector((min(min_co.x, wc.x), min(min_co.y, wc.y), min(min_co.z, wc.z)))
        max_co = Vector((max(max_co.x, wc.x), max(max_co.y, wc.y), max(max_co.z, wc.z)))

# --- Scale to target height ---
current_height = max_co.z - min_co.z  # Z is up in Blender after GLB Y-up import
if current_height > 0.001:
    scale_factor = TARGET_HEIGHT / current_height
    if abs(scale_factor - 1.0) > 0.05:
        for obj in bpy.context.scene.objects:
            obj.scale = (scale_factor, scale_factor, scale_factor)
        bpy.ops.object.select_all(action='SELECT')
        bpy.context.view_layer.objects.active = bpy.context.selected_objects[0]
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

# --- Merge close vertices to reduce artifacts ---
for obj in list(bpy.context.scene.objects):
    if obj.type != 'MESH' or not obj.data:
        continue
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=0.001)
    bpy.ops.object.mode_set(mode='OBJECT')

# --- Final mesh repair (fill any holes created by remove_doubles) ---
for obj in list(bpy.context.scene.objects):
    if obj.type != 'MESH' or not obj.data:
        continue
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(obj.data)
    boundary = [e for e in bm.edges if e.is_boundary]
    if boundary:
        bmesh.ops.holes_fill(bm, edges=boundary, sides=8)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.update_edit_mesh(obj.data)
    bpy.ops.object.mode_set(mode='OBJECT')

# --- Triangulate all meshes (Roblox ONLY supports triangles, not quads/n-gons) ---
# Without this step, n-gons from holes_fill and quads from the AI mesh appear as
# holes/invisible faces in Roblox Studio.
for obj in list(bpy.context.scene.objects):
    if obj.type != 'MESH' or not obj.data:
        continue
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    mod = obj.modifiers.new(name="Triangulate", type='TRIANGULATE')
    mod.quad_method = 'BEAUTY'
    mod.ngon_method = 'BEAUTY'
    bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.select_set(False)

# --- Normalize + save textures for FBX embed (fixes "Material_0 Upload failed" in Studio) ---
# GLB importer packs images with blank filepath; FBX exporter uses filepath as
# key, so blank paths cause textures to merge/break.  We unpack each image to a
# temp file so that the FBX exporter can properly embed them.
#
# Additionally we normalize every image to Roblox Studio's import constraints:
#   • Max dimension 1024x1024 (Roblox hard limit — 2K+ Meshy textures cause
#     "Material_0 — Upload failed" during File → Import 3D in Studio).
#   • Force PNG file_format (strips ICC color profiles / alpha-JPEG quirks
#     from Meshy that the Studio importer rejects).
import os, tempfile
_tex_dir = tempfile.mkdtemp(prefix="blender_tex_")
ROBLOX_MAX_TEXTURE_DIM = 1024
for img in bpy.data.images:
    if img.type != 'IMAGE':
        continue
    # Skip empty/render-result placeholders
    if len(img.size) < 2 or img.size[0] == 0 or img.size[1] == 0:
        continue

    # --- Downscale to Roblox's 1024-px per-side limit (preserve aspect) ---
    w, h = int(img.size[0]), int(img.size[1])
    max_dim = max(w, h)
    if max_dim > ROBLOX_MAX_TEXTURE_DIM:
        scale_ratio = ROBLOX_MAX_TEXTURE_DIM / float(max_dim)
        new_w = max(1, int(round(w * scale_ratio)))
        new_h = max(1, int(round(h * scale_ratio)))
        try:
            img.scale(new_w, new_h)
        except Exception as scale_err:
            print(f"[glb_to_fbx] WARN scale failed for {img.name}: {scale_err}")

    # --- Force PNG format — strips ICC profile + normalizes alpha ---
    img.file_format = 'PNG'

    safe_name = img.name.replace('/', '_').replace('\\', '_').replace('.', '_')
    tex_path = os.path.join(_tex_dir, safe_name + '.png')
    img.filepath_raw = tex_path
    try:
        img.save()
    except Exception as save_err:
        print(f"[glb_to_fbx] WARN save failed for {img.name}: {save_err}")
        continue
    # Re-pack so embed_textures=True finds the data in the FBX exporter
    try:
        img.pack()
    except Exception as pack_err:
        print(f"[glb_to_fbx] WARN pack failed for {img.name}: {pack_err}")

# --- Export FBX ---
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.fbx(
    filepath=output_path,
    use_selection=True,
    apply_scale_options='FBX_SCALE_ALL',
    bake_anim=False,
    mesh_smooth_type='FACE',
    add_leaf_bones=False,
    path_mode='COPY',
    embed_textures=True,
)

# Cleanup temp textures
import shutil
shutil.rmtree(_tex_dir, ignore_errors=True)

final_vert_count = 0
for obj in bpy.context.scene.objects:
    if obj.type == 'MESH' and obj.data:
        final_vert_count += len(obj.data.vertices)

print("BLENDER_RESULT:" + json.dumps({
    "meshes": mesh_count,
    "vertices_before": vert_count,
    "vertices_after": final_vert_count,
    "vertices_removed": vert_count - final_vert_count,
    "input": ext,
    "output": "fbx",
}))
