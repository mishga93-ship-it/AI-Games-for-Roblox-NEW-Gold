"""
generate_cages.py
=================

Blender headless script that converts a Meshy/Tripo garment .glb into a
Roblox-ready layered-clothing .fbx with inner and outer wrap cages.

Usage (locally, after installing Blender 4.x):

    blender --background --python generate_cages.py -- \\
        --garment /path/to/input.glb \\
        --output  /path/to/output.fbx \\
        --name    MyJacket \\
        [--template /path/to/Clothing_Cage_Template.blend]
        [--offset 0.005]

The output .fbx contains three objects under one root:
  - <name>             (the garment mesh, scaled/positioned over the body)
  - <name>_InnerCage   (Roblox standard inner cage, untouched)
  - <name>_OuterCage   (the template's outer cage, shrink-wrapped to the garment)

Workflow mirrors Roblox's official Studio Accessory Fitting Tool (AFT):
  https://create.roblox.com/docs/art/accessories/rig-and-cage-existing-models

The OuterCage MUST NOT have vertices added/deleted or UV layout changed —
only vertex positions are pushed outward. We use Blender's SHRINKWRAP
modifier in 'TARGET_PROJECT' mode with a small positive offset so each
OuterCage vertex projects to the nearest garment surface and sits just
above it. This is the documented manual workflow done programmatically.
"""

from __future__ import annotations

import argparse
import math
import os
import sys
from typing import Optional

import bpy  # type: ignore


def _strip_argv_before_doubledash() -> list[str]:
    """Blender swallows everything before ' -- ' as its own args. Strip it."""
    if "--" not in sys.argv:
        return []
    return sys.argv[sys.argv.index("--") + 1:]


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate Roblox layered-clothing cages")
    parser.add_argument("--garment", required=True, help="Input garment .glb path")
    parser.add_argument("--output", required=True, help="Output .fbx path")
    parser.add_argument(
        "--name",
        required=True,
        help="Asset name used as prefix: <name>, <name>_InnerCage, <name>_OuterCage",
    )
    parser.add_argument(
        "--template",
        default=os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            "Clothing_Cage_Template.blend",
        ),
        help="Path to Roblox's Clothing_Cage_Template.blend",
    )
    parser.add_argument(
        "--offset",
        type=float,
        default=0.005,
        help="Shrinkwrap offset in Blender units (0.005 = thin air gap over garment)",
    )
    return parser.parse_args(_strip_argv_before_doubledash())


def _wipe_scene() -> None:
    """Empty the default Blender scene so we start clean."""
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False, confirm=False)
    for block in (
        bpy.data.meshes,
        bpy.data.materials,
        bpy.data.textures,
        bpy.data.images,
        bpy.data.armatures,
    ):
        for item in list(block):
            block.remove(item)


def _import_garment(glb_path: str, target_name: str) -> bpy.types.Object:
    """Load the .glb, return the merged main mesh object."""
    if not os.path.exists(glb_path):
        raise FileNotFoundError(f"Garment glb not found: {glb_path}")
    pre_objects = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=glb_path)
    new_objects = [o for o in bpy.data.objects if o not in pre_objects]
    mesh_objects = [o for o in new_objects if o.type == "MESH"]
    if not mesh_objects:
        raise RuntimeError("Imported glb contained no mesh objects")
    # If the .glb has multiple mesh parts, join them into one so the
    # Shrinkwrap target is a single closed surface.
    bpy.ops.object.select_all(action="DESELECT")
    for obj in mesh_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = mesh_objects[0]
    if len(mesh_objects) > 1:
        bpy.ops.object.join()
    garment = bpy.context.view_layer.objects.active
    garment.name = target_name
    # Roblox layered clothing uses meters; Meshy/Tripo output is usually
    # already in meters, but we still apply scale/rotation/location so the
    # transform doesn't drift into the cage mesh as offset.
    bpy.ops.object.select_all(action="DESELECT")
    garment.select_set(True)
    bpy.context.view_layer.objects.active = garment
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    # Coordinate-system alignment: Roblox's Clothing_Cage_Template.blend was
    # authored in Maya (Y-up). Blender stores those vertex coordinates as-is,
    # so inside Blender's Z-up world the InnerCage stands tall along Y. A
    # glTF import, however, converts the asset to Blender's native Z-up.
    # To make the shrinkwrap see aligned geometry we rotate the garment's
    # MESH DATA directly (-90° around X) instead of using rotation_euler +
    # transform_apply — the operator-based path is brittle under
    # --background mode contexts when the active object was just set.
    # Manual mesh-vertex rotation avoids the issue entirely.
    import math as _math
    import mathutils  # type: ignore
    rot = mathutils.Matrix.Rotation(_math.radians(-90.0), 4, "X")
    garment.data.transform(rot)
    garment.data.update()

    # 2026-05-22 — auto-rescale to Roblox stud scale and reposition over the
    # cage body. Meshy/Tripo outputs are in raw model units which Studio
    # interprets at huge stud scale on FBX import — the user reported the
    # imported accessory failed UGC bounds check ("doesn't fit in required
    # bounds, scale till it fits into the blue bounding box") because the
    # garment was 5-10× the target chest size.
    #
    # Roblox layered-clothing UGC bounds (per docs): ≤8 studs in any
    # dimension. A torso-chest garment typically sits at ~2.5-3 studs tall.
    # Roblox's body cage template (which we already loaded) is ~5.5 studs
    # tall (Y) — we use it as the reference: garment should fit inside
    # roughly the upper half of that cage (chest area).
    #
    # Strategy: scale the garment uniformly so its longest dimension equals
    # TARGET_GARMENT_LONGEST_DIM studs, then translate it so its centre
    # sits at the cage's chest height (Y ≈ +1.0, the cage spans Y=-3..+2.5).
    bbox = [garment.matrix_world @ mathutils.Vector(corner) for corner in garment.bound_box]
    xs = [v.x for v in bbox]; ys = [v.y for v in bbox]; zs = [v.z for v in bbox]
    cur_dim = max(max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs))
    target_longest = 2.6  # studs — fits within UGC ≤8 bounds with breathing room
    if cur_dim > 0.001:
        scale = target_longest / cur_dim
        scale_mat = mathutils.Matrix.Scale(scale, 4)
        garment.data.transform(scale_mat)
        print(f"[generate_cages] auto-rescale: longest dim {cur_dim:.3f} → "
              f"{cur_dim * scale:.3f} (scale ×{scale:.4f})")
    # Re-center on origin then translate up to cage chest level so the BVH
    # shrinkwrap finds the cage's chest vertices.
    bbox2 = [mathutils.Vector(corner) for corner in garment.bound_box]
    cx = (max(v.x for v in bbox2) + min(v.x for v in bbox2)) / 2
    cy = (max(v.y for v in bbox2) + min(v.y for v in bbox2)) / 2
    cz = (max(v.z for v in bbox2) + min(v.z for v in bbox2)) / 2
    chest_offset_y = 1.0  # cage chest centre ≈ Y=+1 in the template
    translate = mathutils.Matrix.Translation((-cx, -cy + chest_offset_y, -cz))
    garment.data.transform(translate)
    garment.data.update()
    return garment


def _append_cages(template_path: str) -> tuple[bpy.types.Object, bpy.types.Object]:
    """Append InnerCage + OuterCage objects from the Roblox template."""
    if not os.path.exists(template_path):
        raise FileNotFoundError(f"Cage template not found: {template_path}")
    # Find the actual object names inside the template — Roblox has used
    # several conventions over the years ("InnerCage", "_InnerCage",
    # "Clothing_InnerCage"). Discover dynamically.
    with bpy.data.libraries.load(template_path, link=False) as (src, dst):
        candidates = [n for n in src.objects if "cage" in n.lower()]
        if len(candidates) < 2:
            raise RuntimeError(
                f"Template {template_path} doesn't contain two cage meshes. "
                f"Found: {list(src.objects)}"
            )
        inner_name = next((n for n in candidates if "inner" in n.lower()), None)
        outer_name = next((n for n in candidates if "outer" in n.lower()), None)
        if not inner_name or not outer_name:
            raise RuntimeError(
                f"Couldn't identify inner/outer cages by name. "
                f"Candidates: {candidates}"
            )
        dst.objects = [inner_name, outer_name]
    # Re-fetch after append — Blender renames duplicates with .001 suffix
    # if they already exist in the scene, but at this point the scene is
    # empty save for the garment.
    inner = bpy.data.objects[inner_name]
    outer = bpy.data.objects[outer_name]
    bpy.context.collection.objects.link(inner)
    bpy.context.collection.objects.link(outer)
    return inner, outer


def _shrinkwrap_outer_cage(
    outer: bpy.types.Object,
    garment: bpy.types.Object,
    offset: float,
) -> None:
    """
    Push each OuterCage vertex outward to sit just above the garment
    surface — but only the vertices that are actually NEAR the garment.
    Vertices far from the garment retain their body-template position.

    Why we abandoned the Shrinkwrap modifier:
      - TARGET_PROJECT pulled EVERY vertex (including legs/feet) toward
        the garment, crushing the cage when the accessory only covered
        the upper body.
      - PROJECT mode only displaces vertices whose normal ray hits the
        target, BUT it relies on a closed/manifold target mesh — Meshy
        outputs often have open surfaces and non-manifold topology, and
        the unbounded ray length sent vertices flying tens of studs away.

    Manual algorithm with explicit distance threshold:
      1. Build a BVH spatial tree over the garment mesh.
      2. For each OuterCage vertex find the nearest garment surface point.
      3. If distance ≤ threshold → push vertex to that surface point plus
         a small outward offset along the garment's surface normal.
      4. Otherwise → leave the vertex at its template position.

    Topology and UVs are untouched (only coordinates move), so the
    Roblox "do not delete vertices or alter UVs" rule is respected.
    """
    import mathutils  # type: ignore
    from mathutils.bvhtree import BVHTree  # type: ignore

    # Build a BVH over the garment in world space. World coordinates so
    # we can compare directly with OuterCage's world-space vertex
    # positions; both objects are at the origin with identity transforms
    # after we apply transforms in _import_garment / _append_cages, but
    # multiplying by matrix_world keeps the math defensive against any
    # future stray translation/rotation.
    garment_world_verts = [
        garment.matrix_world @ v.co for v in garment.data.vertices
    ]
    garment_polys = [list(p.vertices) for p in garment.data.polygons]
    bvh = BVHTree.FromPolygons(garment_world_verts, garment_polys, all_triangles=False)

    # Tunable distance threshold. The cage template is ≈3.2 × 5.5 × 0.8
    # studs (Roblox blocky body). A garment sits ≤0.3-0.5 studs outside
    # the body surface. Anything farther is "elsewhere on the body" and
    # the cage should keep its template position.
    threshold = 0.5  # studs

    outer_inv = outer.matrix_world.inverted()
    moved = 0
    for v in outer.data.vertices:
        world_pos = outer.matrix_world @ v.co
        hit = bvh.find_nearest(world_pos)
        if not hit:
            continue
        location, normal, _face_idx, dist = hit
        if location is None or dist > threshold:
            continue
        # Push outward along garment's surface normal at that point so
        # the cage sits just OUTSIDE the garment (Roblox layered clothing
        # requires inner cage < garment < outer cage in offset stack).
        if normal is None:
            normal = mathutils.Vector((0, 0, 1))
        new_world = location + normal * offset
        v.co = outer_inv @ new_world
        moved += 1

    outer.data.update()
    print(f"[generate_cages] moved {moved}/{len(outer.data.vertices)} outer-cage vertices "
          f"(threshold={threshold} studs, offset={offset})")


def _name_cages(
    inner: bpy.types.Object,
    outer: bpy.types.Object,
    prefix: str,
) -> None:
    """Rename per Roblox spec: <Name>_InnerCage, <Name>_OuterCage."""
    inner.name = f"{prefix}_InnerCage"
    outer.name = f"{prefix}_OuterCage"
    # The mesh datablock must also carry the matching name; Studio's importer
    # uses object name, but some Blender→FBX pipelines emit the mesh-data name
    # too, so syncing them avoids subtle Studio import warnings.
    if inner.data:
        inner.data.name = inner.name
    if outer.data:
        outer.data.name = outer.name


def _select_only(objects: list[bpy.types.Object]) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    if objects:
        bpy.context.view_layer.objects.active = objects[0]


def _export_fbx(output_path: str, objects: list[bpy.types.Object]) -> None:
    """Export selected objects as a Roblox-compatible FBX 7.4 ASCII/binary."""
    os.makedirs(os.path.dirname(os.path.abspath(output_path)) or ".", exist_ok=True)
    _select_only(objects)
    # Settings tuned to match Roblox Studio's FBX importer expectations
    # (Y-up, scale 1.0, ASCII path so we can grep/troubleshoot if needed).
    bpy.ops.export_scene.fbx(
        filepath=output_path,
        use_selection=True,
        global_scale=1.0,
        apply_unit_scale=True,
        apply_scale_options="FBX_SCALE_NONE",
        axis_forward="-Z",
        axis_up="Y",
        bake_space_transform=False,
        object_types={"MESH"},
        use_mesh_modifiers=True,
        mesh_smooth_type="OFF",
        use_subsurf=False,
        use_mesh_edges=False,
        use_tspace=False,
        path_mode="COPY",
        embed_textures=True,
    )


def main() -> int:
    args = _parse_args()
    print(f"[generate_cages] garment={args.garment}")
    print(f"[generate_cages] output={args.output}")
    print(f"[generate_cages] name={args.name}")
    print(f"[generate_cages] template={args.template}")
    print(f"[generate_cages] offset={args.offset}")

    _wipe_scene()
    garment = _import_garment(args.garment, target_name=args.name)
    print(f"[generate_cages] imported garment: {garment.name} "
          f"({len(garment.data.vertices)} verts, {len(garment.data.polygons)} polys)")

    inner, outer = _append_cages(args.template)
    print(f"[generate_cages] appended cages: {inner.name} "
          f"({len(inner.data.vertices)} verts), {outer.name} "
          f"({len(outer.data.vertices)} verts)")

    _shrinkwrap_outer_cage(outer, garment, args.offset)
    print(f"[generate_cages] shrinkwrap applied to {outer.name}")

    _name_cages(inner, outer, args.name)
    print(f"[generate_cages] renamed: {inner.name}, {outer.name}")

    _export_fbx(args.output, [garment, inner, outer])
    size_bytes = os.path.getsize(args.output)
    print(f"[generate_cages] exported {args.output} ({size_bytes:,} bytes)")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # noqa: BLE001
        # Surface the error to Blender's stderr so the HTTP wrapper can
        # bubble it to the caller as a 500.
        import traceback
        traceback.print_exc()
        print(f"[generate_cages] FAILED: {exc}", file=sys.stderr)
        sys.exit(1)
