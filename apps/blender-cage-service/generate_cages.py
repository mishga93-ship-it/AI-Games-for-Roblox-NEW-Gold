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
    Project every OuterCage vertex outward to sit just above the garment
    surface. Uses Blender's built-in SHRINKWRAP modifier in TARGET_PROJECT
    mode which is the closest match to Roblox AFT's cage-fitting algorithm
    (push-toward-nearest-surface with normal-aligned offset).

    Rule from Roblox docs we MUST not violate: don't add/remove vertices
    or change UVs. Shrinkwrap only moves existing vertex positions, so
    topology + UVs are preserved.
    """
    bpy.context.view_layer.objects.active = outer
    bpy.ops.object.select_all(action="DESELECT")
    outer.select_set(True)
    # 2026-05-22 — choice of Shrinkwrap mode.
    # TARGET_PROJECT (initial pick) pulls every vertex to the nearest
    # garment surface, which crushed the cage downward when the garment
    # only covered the upper body. PROJECT mode only displaces vertices
    # whose normal ray actually hits the target — matches Roblox AFT's
    # "only adjust vertices that intersect the accessory" workflow.
    mod = outer.modifiers.new(name="CageWrap", type="SHRINKWRAP")
    mod.target = garment
    mod.wrap_method = "PROJECT"
    mod.wrap_mode = "OUTSIDE"           # cage stays outside garment surface
    mod.offset = offset                 # small air gap (no z-fighting)
    mod.project_limit = 0.0             # unlimited ray length
    mod.use_negative_direction = True   # check both ways along the normal
    mod.use_positive_direction = True
    # At least one axis must be enabled or PROJECT silently does nothing.
    # Local Z is the standard "outward" direction on Roblox cage meshes.
    mod.use_project_z = True
    mod.cull_face = "OFF"
    # Bake the modifier into actual vertex positions so the exported FBX
    # has the deformed mesh, not a modifier stack the importer might ignore.
    bpy.ops.object.modifier_apply(modifier=mod.name)


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
