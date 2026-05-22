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


def _remove_baked_wheels(obj: bpy.types.Object) -> None:
    """Delete vertices inside cylindrical wheel zones at the 4 bottom corners
    of the mesh bbox. Meshy meshes for vehicles consistently include the
    wheels as baked geometry (even when the prompt says "no wheels"), and
    those baked wheels overlap our procedural Cylinder wheels — visible to
    the user as "колеса где-то в середине" / "колёса не туды" because the
    procedural ones sit beside the visible baked ones.

    Heuristic: in mesh-local space after Blender's GLB Y-up import + our
    auto-orient pass, the car's length axis is X. Wheel centres are
    approximately at:
        X = ±extent_x * 0.40   (front + rear axles, near corners but not flush)
        Z = ±extent_z * 0.42   (sides)
        Y = mn.y + extent_y * 0.20  (lower quarter of bbox)
    Radius ≈ extent_y * 0.45 (wheels are about as tall as half the bbox).

    Any vertex inside one of those 4 spheres gets removed in edit mode. The
    body geometry above (chassis, doors, hood, cabin) is untouched."""
    import bmesh  # noqa: PLC0415 — Blender-only module, must import inside

    mn, mx = _bbox_of(obj)
    extent_x = mx.x - mn.x
    extent_y = mx.y - mn.y
    extent_z = mx.z - mn.z
    cx_front = mx.x - extent_x * 0.10  # front axle x
    cx_rear  = mn.x + extent_x * 0.10  # rear axle x
    cz_left  = mn.z + extent_z * 0.05  # left side z (just inside bbox)
    cz_right = mx.z - extent_z * 0.05
    cy = mn.y + extent_y * 0.20        # wheel centre y, in lower quarter
    wheel_radius = max(extent_y * 0.45, extent_z * 0.25)

    wheel_centres = [
        (cx_front, cy, cz_left),
        (cx_front, cy, cz_right),
        (cx_rear,  cy, cz_left),
        (cx_rear,  cy, cz_right),
    ]
    print(f"[vehicle_fix] baked-wheel removal: 4 centres at x=±{(extent_x*0.40):.3f} z=±{(extent_z*0.42):.3f} y={cy:.3f} radius={wheel_radius:.3f}")

    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="DESELECT")

    bm = bmesh.from_edit_mesh(obj.data)
    selected_count = 0
    rsq = wheel_radius * wheel_radius
    for v in bm.verts:
        for (cx, cy_c, cz) in wheel_centres:
            dx = v.co.x - cx
            dy = v.co.y - cy_c
            dz = v.co.z - cz
            if dx * dx + dy * dy + dz * dz < rsq:
                v.select = True
                selected_count += 1
                break
    bmesh.update_edit_mesh(obj.data)
    if selected_count > 0:
        bpy.ops.mesh.delete(type="VERT")
    bpy.ops.object.mode_set(mode="OBJECT")
    print(f"[vehicle_fix] removed {selected_count} vertices in 4 wheel zones")


def _make_glass_transparent(obj: bpy.types.Object, alpha: float = 0.4) -> None:
    """Mesh windows are usually painted as a dark-blue or dark-grey region in
    the texture. Roblox MeshPart respects per-pixel alpha in the texture
    (PNG with alpha channel), so we walk each material's base-color image
    and SOFTEN the dark pixels (alpha goes from 1.0 → ~0.4). The result is
    glass-like transparency on windows without per-face material splitting.

    This is best-effort: if Meshy bakes windows as opaque dark blue
    everywhere this works, if windows share material with other dark parts
    the trade-off is some unwanted transparency on the body. For Phase B
    we ship it and let the user judge."""
    try:
        from PIL import Image  # type: ignore  # noqa: PLC0415
    except ImportError:
        print("[vehicle_fix] glass-transparent: Pillow not installed in Blender python, skipping")
        return
    if not obj.data.materials:
        print("[vehicle_fix] glass-transparent: object has no materials, skipping")
        return
    for mat in obj.data.materials:
        if mat is None or not mat.use_nodes:
            continue
        for node in mat.node_tree.nodes:
            if node.type != "TEX_IMAGE":
                continue
            img = node.image
            if img is None or img.size[0] == 0 or img.size[1] == 0:
                continue
            # Bake Blender image to a temp PNG, soften dark pixels via PIL.
            tmp_in = f"/tmp/{img.name}_in.png"
            tmp_out = f"/tmp/{img.name}_out.png"
            try:
                img.filepath_raw = tmp_in
                img.file_format = "PNG"
                img.save()
                pil = Image.open(tmp_in).convert("RGBA")
                pixels = pil.load()
                w, h = pil.size
                softened = 0
                for y in range(h):
                    for x in range(w):
                        r, g, b, a = pixels[x, y]
                        # Detect window-glass pixels: dark-ish (mean RGB < 80)
                        # AND somewhat blue (B >= R, B >= G) OR pure dark grey.
                        mean = (r + g + b) // 3
                        if mean < 80 and (b >= r and b >= g or abs(r - g) + abs(g - b) < 20):
                            pixels[x, y] = (r, g, b, int(255 * alpha))
                            softened += 1
                pil.save(tmp_out, "PNG")
                # Re-load softened PNG back into the Blender Image data block.
                img.filepath = tmp_out
                img.reload()
                print(f"[vehicle_fix] glass-transparent: {img.name} softened {softened}/{w*h} dark pixels (alpha={alpha})")
            except Exception as err:  # noqa: BLE001
                print(f"[vehicle_fix] glass-transparent: failed for {img.name}: {err}")


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
    # Auto-orient DISABLED 2026-05-22 (round 17). Blender's
    # transform_apply(rotation=True) doesn't reliably bake the rotation
    # into the exported GLB when combined with export_yup=True — the
    # bbox extents after rotation matched extents BEFORE rotation in my
    # local logs, which means either the rotation didn't take effect or
    # the export's Y-up conversion undid it. Either way, TS-side
    # robloxWorker.ts reads natural sizeX/sizeY/sizeZ from
    # extractMeshIdFromModel AFTER Blender ran and applies its own
    # forwardIsX detection + meshRot=[0,90,0] when X>Z. If Blender ALSO
    # rotated, we get DOUBLE-rotation → mesh visual faces world -X
    # (90° left of chassis forward) → user reports "едет боком, не
    # крутятся колёса, нет звуков" because chassis pushes -Z but mesh
    # points -X. Letting TS handle rotation alone keeps it deterministic.
    # _auto_orient_forward_minus_z(body)
    # Phase B (session 373 round 13): delete baked-in wheels + soften the
    # window pixels so they read as glass in Studio. Both are best-effort
    # heuristics — they help typical Meshy outputs but may misbehave on
    # unusual meshes (e.g. monster trucks where wheels aren't at the corners,
    # or vehicles whose entire body is dark-blue and gets partial alpha
    # applied). Failures fail-soft via try/except so the rest of the
    # pipeline keeps working.
    # Phase B v1 baked-wheel removal DISABLED 2026-05-22 (round 15).
    # The sphere-mask heuristic with radius = max(extent_y*0.45, extent_z*0.25)
    # was wildly too aggressive on Vehicle_LowPolyCar — radius ≈ 0.45 stud
    # on a 1.0-stud-tall mesh = nearly HALF the body height, which deleted
    # not just the wheels but the fenders, lower doors, and front-right
    # bumper, leaving the user-visible result described as "погрызли" (gnawed).
    # Re-enable only with a much tighter mask: cylinder along the wheel axle
    # axis with radius ~0.15-0.20 of bbox extent_y, AND y-band restricted to
    # the bottom 30% of the bbox. Or skip entirely and accept the visual
    # overlap of procedural wheels with Meshy's baked wheels — a duplicated
    # wheel reads better than a hole in the car body.
    # try:
    #     _remove_baked_wheels(body)
    # except Exception as err:  # noqa: BLE001
    #     print(f"[vehicle_fix] _remove_baked_wheels failed (continuing): {err}")
    _apply_primary_color(body, args.primary_hex)
    # Glass-transparent step disabled in Phase B v1 — the mean<80 dark-pixel
    # heuristic was way too broad on Meshy textures (whole car body is
    # dark-ish baseline, so 100% of texels got softened → entire mesh
    # rendered semi-transparent in Studio). Will revisit with a tighter
    # detector (saturated-blue OR pure-black region only) once we have
    # Phase B v1 user feedback on baked-wheel removal alone.
    # Final recenter pass so any rotation / vertex deletion didn't shift the
    # bbox off centre.
    _recenter_origin(body)
    _export_glb(args.output)
    print("[vehicle_fix] done")


if __name__ == "__main__":
    main()
