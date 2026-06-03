"""
generate_cages.py
=================

Blender headless script that converts a Meshy/Tripo garment .glb into a
Roblox-ready **layered clothing** .glb: a garment mesh SKINNED to the R15
armature, plus an inner + outer wrap cage, so Studio's 3D Importer builds a
proper `WrapLayer` (clothing that wraps and deforms with the avatar) — NOT a
flat mesh glued to the body.

Usage (locally, after installing Blender 4.x):

    blender --background --python generate_cages.py -- \\
        --garment /path/to/input.glb \\
        --output  /path/to/output.glb \\
        --name    MyJacket \\
        [--template /path/to/Combined-Template.blend] \\
        [--offset 0.02]

Why this shape (verified against Roblox's own reference Long_Sleeve_Export.fbx
and the official "create clothing" tutorial, 2026-06):

  Roblox layered clothing deforms via TWO mechanisms working together:
    1. SKINNING — the garment mesh is rigged to the R15 skeleton (bones
       LowerTorso/UpperTorso/Head/…Arm/…Leg) so it moves with the body. The
       cage alone does NOT deform the mesh; a non-skinned mesh just stays rigid
       / glues flat (this was the old bug: exported GLB had skins:0).
    2. CAGING — an inner cage (standard body surface, untouched) + an outer
       cage (inflated to cover the garment) let Studio layer the item over the
       body and other clothing. Cages MUST keep the template's 1358-vert
       topology + UVs (only vertex POSITIONS may move — never add/delete verts).

  The official Blender workflow skins clothing with "Parent → With Automatic
  Weights" (bone-heat), which needs only the armature — no body mesh. That's
  why Roblox's Combined-Template ships an armature + cages but no skinned body.

Output GLB contains exactly four objects:
  - Armature            (R15 skeleton, bones named for Roblox auto-mapping)
  - <name>              (garment, skinned to the armature)
  - <name>_InnerCage    (1358-vert standard body inner cage, untouched)
  - <name>_OuterCage    (1358-vert cage inflated to cover the garment)

GLB (not FBX) is used because it reliably carries Meshy's textures/colour into
Roblox and imports at 1 unit = 1 stud, so the template's native ~5.5-unit
avatar scale is automatically correct. glTF fully supports skins + the
`_InnerCage`/`_OuterCage` node-name convention the importer keys on.
"""

from __future__ import annotations

import argparse
import math
import os
import sys

import bpy  # type: ignore
import mathutils  # type: ignore


# --------------------------------------------------------------------------- #
# args
# --------------------------------------------------------------------------- #
def _strip_argv_before_doubledash() -> list[str]:
    if "--" not in sys.argv:
        return []
    return sys.argv[sys.argv.index("--") + 1:]


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate Roblox layered-clothing GLB")
    parser.add_argument("--garment", required=True, help="Input garment .glb path")
    parser.add_argument("--output", required=True, help="Output .glb path")
    parser.add_argument("--name", required=True, help="Asset name (object + cage prefix)")
    parser.add_argument(
        "--template",
        default=os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            "Combined-Template.blend",
        ),
        help="Roblox Combined-Template.blend (R15 armature + clothing cages)",
    )
    parser.add_argument(
        "--offset",
        type=float,
        default=0.02,
        help="Outer-cage clearance over the garment, in template units (~studs)",
    )
    # Accepted for backward-compat with server.py; size now comes from fitting
    # the garment onto the template body, so this is advisory only.
    parser.add_argument("--target-size", type=float, default=4.0, help=argparse.SUPPRESS)
    return parser.parse_args(_strip_argv_before_doubledash())


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
def _world_bbox(obj: bpy.types.Object):
    """Return (min_vec, max_vec, center_vec, dims_vec) in world space.

    Computed from actual mesh vertices (not obj.bound_box) because bound_box is
    lazily cached and goes stale right after we edit mesh data with
    `mesh.transform(...)`, which silently broke fit/scale calculations."""
    mw = obj.matrix_world
    if obj.type == "MESH" and obj.data and len(obj.data.vertices):
        pts = [mw @ v.co for v in obj.data.vertices]
    else:
        pts = [mw @ mathutils.Vector(c) for c in obj.bound_box]
    mn = mathutils.Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = mathutils.Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return mn, mx, (mn + mx) / 2.0, (mx - mn)


def _open_template(template_path: str):
    """Open Combined-Template.blend and locate the armature + clothing cages."""
    if not os.path.exists(template_path):
        raise FileNotFoundError(f"Combined template not found: {template_path}")
    bpy.ops.wm.open_mainfile(filepath=template_path)

    armature = next((o for o in bpy.data.objects if o.type == "ARMATURE"), None)
    if armature is None:
        raise RuntimeError("Template has no armature object")

    # Clothing cages are the pair parented under the 'Clothing Cages' empty
    # (named YourClothingName_InnerCage / _OuterCage). Find them by suffix; an
    # InnerCage exists ONLY for the clothing pair (body cages are *_OuterCage).
    inner = next((o for o in bpy.data.objects
                  if o.type == "MESH" and o.name.endswith("InnerCage")), None)
    if inner is None:
        raise RuntimeError("Template has no clothing InnerCage")
    outer_name = inner.name.replace("InnerCage", "OuterCage")
    outer = bpy.data.objects.get(outer_name)
    if outer is None:
        raise RuntimeError(f"Template missing matching {outer_name}")

    # Unhide everything we keep so the exporter & ops can touch it.
    for o in (armature, inner, outer):
        o.hide_set(False)
        o.hide_viewport = False
        o.hide_render = False
    print(f"[generate_cages] template opened: armature={armature.name!r} "
          f"inner={inner.name!r} outer={outer.name!r} "
          f"(cages {len(inner.data.vertices)}/{len(outer.data.vertices)} verts)")
    return armature, inner, outer


def _import_garment(glb_path: str, target_name: str) -> bpy.types.Object:
    """Import the garment .glb, join parts into one mesh, apply transforms.

    No manual axis rotation: Blender's glTF importer already converts the
    garment's Y-up source to Blender Z-up, so it stands tall along Z just like
    the template cages. (The old pipeline's hard -90deg X rotation is what made
    the shirt lie flat.)"""
    if not os.path.exists(glb_path):
        raise FileNotFoundError(f"Garment glb not found: {glb_path}")
    pre = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=glb_path)
    new = [o for o in bpy.data.objects if o not in pre]
    meshes = [o for o in new if o.type == "MESH"]
    if not meshes:
        raise RuntimeError("Imported glb contained no mesh objects")

    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    garment = bpy.context.view_layer.objects.active

    # Drop any non-mesh helpers the importer added (empties/lights/cameras).
    for o in new:
        if o is not garment and o.name in bpy.data.objects and o.type != "MESH":
            bpy.data.objects.remove(o, do_unlink=True)

    garment.name = target_name
    if garment.data:
        garment.data.name = target_name
    bpy.ops.object.select_all(action="DESELECT")
    garment.select_set(True)
    bpy.context.view_layer.objects.active = garment
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    print(f"[generate_cages] garment imported: {len(garment.data.vertices)} verts, "
          f"{len(garment.data.polygons)} polys")
    return garment


def _fit_garment_to_body(garment: bpy.types.Object, inner_cage: bpy.types.Object) -> None:
    """Scale + position the garment so it covers the body region the inner cage
    represents. Uniform scale (preserves the garment's proportions); compact
    items map to the upper torso, tall items (full outfits/dresses) cover most
    of the body."""
    _, _, icenter, idims = _world_bbox(inner_cage)
    inner_h = idims.z  # cages stand tall along Z
    inner_top = icenter.z + inner_h / 2.0

    _, _, _, gdims = _world_bbox(garment)
    g_h = gdims.z
    g_horiz = max(gdims.x, gdims.y)
    # Classify: a compact top (hoodie/shirt/sweater/jacket) covers the upper
    # body (~2.5 studs); a full outfit (dress/jumpsuit/overalls) covers most of
    # it (~4.8 studs). Prefer the NAME — far more reliable than the mesh aspect
    # ratio. A puffy hoodie's taller proportions (≈1.4:1) used to trip the old
    # 1.3 aspect threshold → misread as a full outfit → scaled to ~4.8 studs =
    # huge, then skinned head-to-toe → exploded mess on the avatar.
    nm = (garment.name or "").lower()
    TALL_WORDS = ("dress", "gown", "jumpsuit", "overall", "robe", "kimono",
                  "cloak", "fullbody", "full_body", "fullsuit", "onesie", "romper")
    COMPACT_WORDS = ("hoodie", "hood", "shirt", "tshirt", "t_shirt", "tee", "top",
                     "sweater", "sweatshirt", "jacket", "crew", "polo", "vest",
                     "blouse", "jersey", "crop", "pullover", "cardigan", "coat")
    if any(w in nm for w in COMPACT_WORDS):
        is_tall = False
    elif any(w in nm for w in TALL_WORDS):
        is_tall = True
    else:
        # Fallback: aspect ratio with a HIGH threshold so only genuinely tall
        # garments (height ≫ width) count as full outfits.
        is_tall = (g_h > 1.8 * g_horiz) if g_horiz > 1e-4 else False
    frac = 0.88 if is_tall else 0.46
    print(f"[generate_cages] garment_type: name={nm!r} ratio={g_h / g_horiz if g_horiz > 1e-4 else 0:.2f} is_tall={is_tall} frac={frac}")

    if g_h > 1e-4:
        s = (inner_h * frac) / g_h
        garment.data.transform(mathutils.Matrix.Scale(s, 4))
        garment.data.update()

    # Re-measure after scaling, then translate: centre on the body X/Y and hang
    # from just below the neck (compact) or centre vertically (tall).
    _, _, gcenter, gdims2 = _world_bbox(garment)
    g_top = gcenter.z + gdims2.z / 2.0
    if is_tall:
        target_top = inner_top - inner_h * 0.06
    else:
        target_top = inner_top - inner_h * 0.10  # leave the neck/collar clear
    delta = mathutils.Vector((icenter.x - gcenter.x,
                              icenter.y - gcenter.y,
                              target_top - g_top))
    garment.data.transform(mathutils.Matrix.Translation(delta))
    garment.data.update()
    print(f"[generate_cages] fit garment: inner_h={inner_h:.2f} is_tall={is_tall} "
          f"frac={frac} scale_applied -> garment dims now "
          f"{[round(v, 2) for v in _world_bbox(garment)[3]]}")


def _decimate_garment(garment: bpy.types.Object, target_tris: int = 9000) -> None:
    """Reduce the garment to <= target_tris triangles. Meshy meshes are dense
    (~20-40k tris); Roblox's clothing limit is 10k tris/MeshPart, and a high
    count trips an import warning + slows the asset upload. Decimate BEFORE
    skinning so the bone-heat solve runs on the final, lighter topology."""
    tris = sum(max(0, len(p.vertices) - 2) for p in garment.data.polygons)
    if tris <= target_tris:
        print(f"[generate_cages] decimate skipped: {tris} tris already <= {target_tris}")
        return
    ratio = max(0.05, min(1.0, target_tris / float(tris)))
    bpy.ops.object.select_all(action="DESELECT")
    garment.select_set(True)
    bpy.context.view_layer.objects.active = garment
    mod = garment.modifiers.new(name="Decimate", type="DECIMATE")
    mod.decimate_type = "COLLAPSE"
    mod.ratio = ratio
    bpy.ops.object.modifier_apply(modifier=mod.name)
    new_tris = sum(max(0, len(p.vertices) - 2) for p in garment.data.polygons)
    print(f"[generate_cages] decimated garment: {tris} -> {new_tris} tris (ratio={ratio:.3f})")


def _skin_garment(garment: bpy.types.Object, armature: bpy.types.Object) -> None:
    """Skin the garment to the R15 armature with automatic (bone-heat) weights —
    the official 'Parent → With Automatic Weights' workflow. Falls back to
    envelope weights if bone-heat fails (Meshy meshes can be non-manifold), then
    guarantees every vertex has at least one weight, capped at 4 influences."""
    bpy.ops.object.select_all(action="DESELECT")
    garment.select_set(True)
    armature.select_set(True)
    bpy.context.view_layer.objects.active = armature

    skinned = False
    try:
        bpy.ops.object.parent_set(type="ARMATURE_AUTO")
        skinned = any(len(v.groups) > 0 for v in garment.data.vertices)
        print(f"[generate_cages] auto (bone-heat) weights: skinned={skinned}")
    except RuntimeError as err:
        print(f"[generate_cages] bone-heat failed ({err}); trying envelope")

    if not skinned:
        # Clear any partial parenting/groups, then envelope weights.
        bpy.ops.object.select_all(action="DESELECT")
        garment.select_set(True)
        armature.select_set(True)
        bpy.context.view_layer.objects.active = armature
        try:
            bpy.ops.object.parent_set(type="ARMATURE_ENVELOPE")
            skinned = any(len(v.groups) > 0 for v in garment.data.vertices)
            print(f"[generate_cages] envelope weights: skinned={skinned}")
        except RuntimeError as err:
            print(f"[generate_cages] envelope failed ({err})")

    # Ensure an Armature modifier exists and points at the rig (parent_set adds
    # one, but be defensive).
    if not any(m.type == "ARMATURE" for m in garment.modifiers):
        mod = garment.modifiers.new(name="Armature", type="ARMATURE")
        mod.object = armature

    # Guarantee no orphan (unweighted) vertices: assign them to UpperTorso so
    # the importer never sees a vertex with zero influences.
    fallback_bone = "UpperTorso"
    if fallback_bone in [b.name for b in armature.data.bones]:
        vg = garment.vertex_groups.get(fallback_bone) or garment.vertex_groups.new(name=fallback_bone)
        orphans = [v.index for v in garment.data.vertices if len(v.groups) == 0]
        if orphans:
            vg.add(orphans, 1.0, "REPLACE")
            print(f"[generate_cages] assigned {len(orphans)} orphan verts -> {fallback_bone}")

    # Cap at 4 influences/vertex (Roblox limit) and renormalize.
    bpy.context.view_layer.objects.active = garment
    bpy.ops.object.select_all(action="DESELECT")
    garment.select_set(True)
    try:
        bpy.ops.object.vertex_group_limit_total(limit=4)
        bpy.ops.object.vertex_group_normalize_all()
    except RuntimeError as err:
        print(f"[generate_cages] weight cleanup warning: {err}")
    n_groups = len(garment.vertex_groups)
    weighted = sum(1 for v in garment.data.vertices if len(v.groups) > 0)
    print(f"[generate_cages] skinned: {weighted}/{len(garment.data.vertices)} verts, "
          f"{n_groups} vertex groups")


def _inflate_outer_cage(outer: bpy.types.Object, garment: bpy.types.Object, offset: float) -> None:
    """Push outer-cage vertices outward to just COVER the garment surface,
    leaving vertices far from the garment at their standard body position.
    Only vertex positions move — topology and UVs are untouched (Roblox: 'do
    not delete vertices or faces of the cages')."""
    from mathutils.bvhtree import BVHTree  # type: ignore

    gw_verts = [garment.matrix_world @ v.co for v in garment.data.vertices]
    gw_polys = [list(p.vertices) for p in garment.data.polygons]
    bvh = BVHTree.FromPolygons(gw_verts, gw_polys, all_triangles=False)

    # Vertical axis (Z) of the body, for "outward" = away from the central axis.
    _, _, icenter, idims = _world_bbox(outer)
    axis_xy = mathutils.Vector((icenter.x, icenter.y))
    # Catch garment within ~20% of body height of each cage vertex.
    threshold = max(idims.x, idims.z) * 0.22

    outer_inv = outer.matrix_world.inverted()
    moved = 0
    for v in outer.data.vertices:
        wp = outer.matrix_world @ v.co
        hit = bvh.find_nearest(wp)
        if not hit:
            continue
        loc, normal, _idx, dist = hit
        if loc is None or dist > threshold:
            continue
        # Outward radial direction from the body's vertical axis.
        radial = mathutils.Vector((wp.x - axis_xy.x, wp.y - axis_xy.y, 0.0))
        if radial.length < 1e-5:
            radial = (normal or mathutils.Vector((0, 1, 0)))
        radial.normalize()
        new_wp = loc + radial * offset
        # Only expand coverage: keep whichever is farther from the axis so the
        # cage never gets pulled inside the garment.
        cur_r = (wp - mathutils.Vector((axis_xy.x, axis_xy.y, wp.z))).length
        new_r = (new_wp - mathutils.Vector((axis_xy.x, axis_xy.y, new_wp.z))).length
        if new_r >= cur_r:
            v.co = outer_inv @ new_wp
            moved += 1
    outer.data.update()
    print(f"[generate_cages] inflated outer cage: moved {moved}/{len(outer.data.vertices)} "
          f"verts (threshold={threshold:.2f}, offset={offset})")


def _finalize(armature, garment, inner, outer, name: str) -> None:
    """Rename per Roblox spec, free the cages (root nodes), and delete every
    other template object so the export contains exactly the four we want."""
    inner.name = f"{name}_InnerCage"
    outer.name = f"{name}_OuterCage"
    if inner.data:
        inner.data.name = inner.name
    if outer.data:
        outer.data.name = outer.name

    # Cages export as free root nodes (like the reference FBX) — clear their
    # 'Clothing Cages' parent while keeping world position.
    for c in (inner, outer):
        mw = c.matrix_world.copy()
        c.parent = None
        c.matrix_world = mw

    keep = {armature, garment, inner, outer}
    for o in list(bpy.data.objects):
        if o not in keep:
            bpy.data.objects.remove(o, do_unlink=True)
    print(f"[generate_cages] finalized scene -> {[o.name for o in bpy.data.objects]}")


def _export_glb(output_path: str) -> None:
    """Export the whole (now 4-object) scene as a Roblox-ready GLB.

    export_apply=False: the garment's Armature modifier MUST survive (applying
    it would bake the rest pose and strip the skinning). The glTF exporter keeps
    skins via export_skins. export_yup converts Blender Z-up to glTF Y-up.
    """
    os.makedirs(os.path.dirname(os.path.abspath(output_path)) or ".", exist_ok=True)
    print(f"[generate_cages] scene objects at export: {[o.name for o in bpy.context.scene.objects]}")
    bpy.ops.export_scene.gltf(
        filepath=output_path,
        export_format="GLB",
        use_selection=False,
        use_visible=False,
        export_yup=True,
        export_apply=False,
        export_skins=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
    )


# --------------------------------------------------------------------------- #
# main
# --------------------------------------------------------------------------- #
def main() -> int:
    args = _parse_args()
    print(f"[generate_cages] garment={args.garment}")
    print(f"[generate_cages] output={args.output}")
    print(f"[generate_cages] name={args.name}")
    print(f"[generate_cages] template={args.template}")
    print(f"[generate_cages] offset={args.offset}")

    armature, inner, outer = _open_template(args.template)
    garment = _import_garment(args.garment, target_name=args.name)
    _fit_garment_to_body(garment, inner)
    _decimate_garment(garment)
    _skin_garment(garment, armature)
    _inflate_outer_cage(outer, garment, args.offset)
    _finalize(armature, garment, inner, outer, args.name)
    _export_glb(args.output)

    size_bytes = os.path.getsize(args.output)
    print(f"[generate_cages] exported {args.output} ({size_bytes:,} bytes): "
          f"skinned garment + {inner.name}/{outer.name} + {armature.name}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # noqa: BLE001
        import traceback
        traceback.print_exc()
        print(f"[generate_cages] FAILED: {exc}", file=sys.stderr)
        sys.exit(1)
