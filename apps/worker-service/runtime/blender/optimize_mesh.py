"""
Blender background script for mesh decimation.

Usage:
  blender --background --python optimize_mesh.py -- <input> <output> [ratio] [max_triangles]

Reads a 3D mesh, applies decimation modifier, and writes the optimised result.
Outputs a JSON stats line prefixed with BLENDER_RESULT: on stdout.
"""

import bpy
import bmesh
import sys
import json

argv = sys.argv
argv = argv[argv.index("--") + 1:]

input_path = argv[0]
output_path = argv[1]
target_ratio = float(argv[2]) if len(argv) > 2 else 0.9
max_triangles = int(argv[3]) if len(argv) > 3 else 0

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

# ── Count original triangles ──────────────────────────────────────────
bpy.context.view_layer.update()
original_tris = 0
for obj in mesh_objects:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    eval_obj = obj.evaluated_get(depsgraph)
    eval_mesh = eval_obj.data
    original_tris += len(eval_mesh.loop_triangles)

# ── Determine effective ratio ─────────────────────────────────────────
effective_ratio = target_ratio
if max_triangles > 0 and original_tris > max_triangles:
    budget_ratio = max_triangles / original_tris
    effective_ratio = min(effective_ratio, budget_ratio)

# ── Repair mesh (fill holes, merge doubles, fix normals) ─────────────
for obj in mesh_objects:
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0001)
    # Fill boundary holes (edges with only one face)
    boundary_edges = [e for e in bm.edges if e.is_boundary]
    if boundary_edges:
        bmesh.ops.holes_fill(bm, edges=boundary_edges, sides=8)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.update_edit_mesh(obj.data)
    bpy.ops.object.mode_set(mode='OBJECT')

# ── Apply decimation ──────────────────────────────────────────────────
for obj in mesh_objects:
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    mod = obj.modifiers.new(name="Decimate", type='DECIMATE')
    mod.ratio = effective_ratio
    bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.select_set(False)

# ── Post-decimation repair (decimation can create new holes) ─────────
for obj in mesh_objects:
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(obj.data)
    boundary = [e for e in bm.edges if e.is_boundary]
    if boundary:
        bmesh.ops.holes_fill(bm, edges=boundary, sides=8)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.update_edit_mesh(obj.data)
    bpy.ops.object.mode_set(mode='OBJECT')

# ── Triangulate all meshes (Roblox only supports triangles) ──────────
for obj in mesh_objects:
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    mod = obj.modifiers.new(name="Triangulate", type='TRIANGULATE')
    mod.quad_method = 'BEAUTY'
    mod.ngon_method = 'BEAUTY'
    bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.select_set(False)

# ── Count final triangles ────────────────────────────────────────────
bpy.context.view_layer.update()
final_tris = 0
for obj in mesh_objects:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    eval_obj = obj.evaluated_get(depsgraph)
    eval_mesh = eval_obj.data
    final_tris += len(eval_mesh.loop_triangles)

# ── Export ────────────────────────────────────────────────────────────
out_ext = output_path.rsplit('.', 1)[-1].lower()
bpy.ops.object.select_all(action='SELECT')
if out_ext == 'glb':
    bpy.ops.export_scene.gltf(
        filepath=output_path, export_format='GLB', use_selection=True,
        export_materials='EXPORT', export_texcoords=True,
        export_normals=True, export_colors=True,
    )
elif out_ext == 'fbx':
    bpy.ops.export_scene.fbx(filepath=output_path, use_selection=True)
elif out_ext == 'obj':
    bpy.ops.wm.obj_export(filepath=output_path, export_selected_objects=True)
else:
    bpy.ops.export_scene.gltf(
        filepath=output_path, export_format='GLB', use_selection=True,
        export_materials='EXPORT', export_texcoords=True,
        export_normals=True, export_colors=True,
    )

print("BLENDER_RESULT:" + json.dumps({
    "original_triangles": original_tris,
    "final_triangles": final_tris,
    "ratio_applied": effective_ratio,
    "mesh_count": len(mesh_objects),
    "mesh_repaired": True,
}))
