"""
vehicle_fix.py
==============

Blender headless preprocessor for Meshy-generated vehicle GLBs. Cleans up
the mesh BEFORE Roblox Open Cloud upload so the resulting MeshPart in
Studio is correctly oriented, centered, and coloured.

Phase A (this script) — 3 fixes:

  1. Recenter origin to centre of geometry. Meshy GLBs sometimes have
     the pivot at one corner or above the mesh, which makes Roblox
     MeshPart's bbox visually offset from the mesh (looks like the car
     is floating or sunk).

  2. Auto-orient: rotate so the LONGEST horizontal axis points along -Z
     (Roblox forward / chassis driving direction). Meshy alternates
     between +X-forward and +Z-forward GLBs depending on the prompt;
     this step normalises so wheels and DriveSeat always align with
     the visible car-front.

  3. Apply primary colour to the Principled BSDF base color of every
     material. Meshy multi-image-to-3d rarely transfers the user-chosen
     colour reliably into the GLB texture; baking it into the material
     here means the imported Roblox MeshPart shows the correct colour
     WITHOUT needing a MeshPart.Color tint (which multiplied over
     unpredictable PBR textures was producing weird hues).

Usage:

    blender --background --python vehicle_fix.py -- \\
        --input  /path/to/meshy-vehicle.glb \\
        --output /path/to/cleaned.glb \\
        --primary-hex "#E03A2E"
"""

from __future__ import annotations

import argparse
import math
import os
import sys

import bpy  # type: ignore
from mathutils import Vector  # type: ignore


def _strip_argv_before_doubledash() -> list[str]:
    if "--" not in sys.argv:
        return []
    return sys.argv[sys.argv.index("--") + 1:]


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fix vehicle GLB for Roblox MeshPart use")
    parser.add_argument("--input", required=True, help="Input GLB path")
    parser.add_argument("--output", required=True, help="Output GLB path")
    parser.add_argument(
        "--primary-hex",
        default="",
        help='Hex colour like "#E03A2E" applied to material base color. '
             'Empty = leave material alone.',
    )
    parser.add_argument(
        "--accent-hex",
        default="",
        help='Hex colour for secondary material slots (roof / spoiler).',
    )
    return parser.parse_args(_strip_argv_before_doubledash())


def _wipe_scene() -> None:
    """Empty the default Blender scene so we start clean."""
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False, confirm=False)
    for block_type in (
        bpy.data.meshes,
        bpy.data.materials,
        bpy.data.images,
        bpy.data.armatures,
    ):
        for block in list(block_type):
            block_type.remove(block)


def _import_glb(path: str) -> list[bpy.types.Object]:
    """Import a GLB and return all newly-created mesh objects."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    after = set(bpy.data.objects)
    new = [o for o in (after - before) if o.type == "MESH"]
    print(f"[vehicle_fix] imported {len(new)} mesh objects from {path}")
    return new


def _join_meshes(objs: list[bpy.types.Object], name: str = "VehicleBody") -> bpy.types.Object:
    """Join multiple mesh parts into one so downstream operations target a
    single object. Returns the joined object."""
    if not objs:
        raise RuntimeError("no mesh objects to join")
    if len(objs) == 1:
        objs[0].name = name
        return objs[0]
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    joined = bpy.context.view_layer.objects.active
    joined.name = name
    print(f"[vehicle_fix] joined {len(objs)} parts into {joined.name}")
    return joined


def _bbox_of(obj: bpy.types.Object) -> tuple[Vector, Vector]:
    """Return (min, max) corners of the object's local-space bounding box
    transformed to world space."""
    corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    mn = Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners)))
    mx = Vector((max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners)))
    return mn, mx


def _recenter_origin(obj: bpy.types.Object) -> None:
    """Move the object's origin to the centre of its mesh geometry so the
    pivot matches the bbox centre. Mirrors Blender's
    Object → Set Origin → Origin to Geometry (Median Point) menu action.

    Without this step, GLBs with off-centre pivots (Meshy sometimes places
    the pivot at the front bumper or above the roof) end up offset inside
    the Roblox MeshPart bbox — the visible car appears in only one corner
    of the MeshPart, leaving empty space the user reads as
    'half sunk' / 'floating'."""
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="MEDIAN")
    # Snap object back to world origin so the resulting GLB has the
    # geometry centred around (0, 0, 0) — Roblox-friendly.
    obj.location = (0.0, 0.0, 0.0)
    print(f"[vehicle_fix] origin recentered to geometry median, snapped to world (0,0,0)")


def _auto_orient_forward_minus_z(obj: bpy.types.Object) -> None:
    """Rotate the mesh so its LONGEST horizontal axis aligns with -Z
    (Roblox forward / chassis driving direction).

    Cars are always longer than they are wide. We measure the bbox extents
    in X and Z (Y is up in both Blender and Roblox). If X > Z, the mesh's
    forward is currently along +X — rotate -90° around Y so +X becomes -Z.

    Note: Blender GLB import uses +Y-up by default (GLB spec). We assume
    the input mesh is already Y-up; if Meshy outputs a Z-up GLB the GLB
    importer should already rotate it. If not, an extra check could be
    added (compare Y vs max(X, Z) — if Y is the longest, the car is on
    its side / nose-up, which would require a different rotation)."""
    mn, mx = _bbox_of(obj)
    extent_x = mx.x - mn.x
    extent_y = mx.y - mn.y
    extent_z = mx.z - mn.z
    print(f"[vehicle_fix] bbox extents X={extent_x:.3f} Y={extent_y:.3f} Z={extent_z:.3f}")
    if extent_x > extent_z * 1.05:
        # Mesh's forward axis is +X; rotate -90° around Y so +X → -Z.
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        obj.rotation_euler = (0.0, math.radians(-90.0), 0.0)
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
        # Re-check after rotation:
        mn2, mx2 = _bbox_of(obj)
        print(f"[vehicle_fix] rotated -90° around Y. new bbox extents X={mx2.x - mn2.x:.3f} Z={mx2.z - mn2.z:.3f}")
    else:
        print(f"[vehicle_fix] mesh forward already aligned with -Z (Z>=X, no rotation needed)")


def _hex_to_rgba(hex_str: str) -> tuple[float, float, float, float]:
    """Convert '#RRGGBB' or 'RRGGBB' to a Blender Principled BSDF base color
    tuple in linear-RGB space. Blender's Principled BSDF expects linear RGB
    (not sRGB), so we convert."""
    s = hex_str.strip().lstrip("#")
    if len(s) != 6:
        raise ValueError(f"invalid hex colour {hex_str!r} — expected 6 chars")
    r = int(s[0:2], 16) / 255.0
    g = int(s[2:4], 16) / 255.0
    b = int(s[4:6], 16) / 255.0

    def srgb_to_linear(c: float) -> float:
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), 1.0)


def _apply_primary_color(obj: bpy.types.Object, primary_hex: str) -> None:
    """Set Principled BSDF base color on every material slot of the object.

    If the object has no materials, create one. Roblox imports GLB
    materials as the MeshPart's surface texture, so baking the primary
    colour here makes the imported MeshPart show the right colour without
    needing a MeshPart.Color override (which previously caused tint-over-
    PBR colour shifts)."""
    if not primary_hex:
        print("[vehicle_fix] no primary colour specified, leaving materials alone")
        return
    rgba = _hex_to_rgba(primary_hex)
    if not obj.data.materials:
        mat = bpy.data.materials.new(name="VehicleMaterial")
        mat.use_nodes = True
        obj.data.materials.append(mat)
    for mat in obj.data.materials:
        if mat is None:
            continue
        if not mat.use_nodes:
            mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        if bsdf is None:
            for node in mat.node_tree.nodes:
                if node.type == "BSDF_PRINCIPLED":
                    bsdf = node
                    break
        if bsdf is None:
            # Last resort — create a Principled BSDF and connect to output.
            bsdf = mat.node_tree.nodes.new(type="ShaderNodeBsdfPrincipled")
            out_node = next((n for n in mat.node_tree.nodes if n.type == "OUTPUT_MATERIAL"), None)
            if out_node is not None:
                mat.node_tree.links.new(bsdf.outputs["BSDF"], out_node.inputs["Surface"])
        # 'Base Color' input is the user-visible colour. Setting default_value
        # works even if there's an image texture connected (it just overrides
        # the constant fallback). For full override we'd disconnect any
        # image input — but for Phase A we leave existing textures intact
        # and just push our hex into the base-color slot.
        try:
            bsdf.inputs["Base Color"].default_value = rgba
        except (KeyError, AttributeError):
            pass
        # Also set viewport / Blender material color (used by older
        # exporters as a fallback).
        mat.diffuse_color = rgba
    print(f"[vehicle_fix] applied primary {primary_hex} → linear {rgba[:3]} to {len(obj.data.materials)} material slot(s)")


def _export_glb(path: str) -> None:
    """Export the current scene as a GLB suitable for Roblox Open Cloud upload."""
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        # Keep materials + textures so Roblox MeshPart receives the bake.
        export_materials="EXPORT",
        # Limit to the active scene to skip stale data blocks.
        use_active_scene=True,
    )
    print(f"[vehicle_fix] exported GLB to {path} ({os.path.getsize(path)} bytes)")


def main() -> None:
    args = _parse_args()
    print(f"[vehicle_fix] input={args.input} output={args.output} primary={args.primary_hex!r}")
    _wipe_scene()
    imported = _import_glb(args.input)
    if not imported:
        print("[vehicle_fix] ERROR: no mesh objects in GLB")
        sys.exit(2)
    body = _join_meshes(imported, name="VehicleBody")
    _recenter_origin(body)
    _auto_orient_forward_minus_z(body)
    _apply_primary_color(body, args.primary_hex)
    # Final recenter pass so any rotation didn't shift the bbox off centre.
    _recenter_origin(body)
    _export_glb(args.output)
    print("[vehicle_fix] done")


if __name__ == "__main__":
    main()
