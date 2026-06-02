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
    parser.add_argument("--output", required=True, help="Output .glb path")
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
    parser.add_argument(
        "--target-size",
        type=float,
        default=4.0,
        help="Longest-dimension target in studs (full outfit ~5, single garment ~2.5)",
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


def _import_garment(glb_path: str, target_name: str, target_size: float = 4.0) -> bpy.types.Object:
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
    # Apply transforms so the mesh data carries its final coordinates.
    bpy.ops.object.select_all(action="DESELECT")
    garment.select_set(True)
    bpy.context.view_layer.objects.active = garment
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    import math as _math
    import mathutils  # type: ignore

    # 2026-06-02 (session 403, round 2): we SHIP THE CAGES again. Roblox layered
    # clothing wraps the body via the cage system (WrapLayer), not bone-skinning,
    # so a clean garment-only mesh just glues flat to the front. The template
    # cages are authored Maya Y-up (they stand tall along Blender Y), but a glTF
    # import puts the garment Z-up (tall along Blender Z). Rotate the garment
    # -90° about X so it stands along Y, matching the cages, so the shrinkwrap and
    # the resulting WrapLayer line up. Final scale/position is done in
    # `_fit_to_cage` once the body cage is loaded (the garment must sit on the
    # standard body the inner cage represents). glTF export converts Y-up -> the
    # Roblox-expected orientation.
    garment.data.transform(mathutils.Matrix.Rotation(_math.radians(-90.0), 4, "X"))
    bb = [mathutils.Vector(c) for c in garment.bound_box]
    cx = (max(v.x for v in bb) + min(v.x for v in bb)) / 2
    cy = (max(v.y for v in bb) + min(v.y for v in bb)) / 2
    cz = (max(v.z for v in bb) + min(v.z for v in bb)) / 2
    garment.data.transform(mathutils.Matrix.Translation((-cx, -cy, -cz)))
    garment.data.update()
    print("[generate_cages] garment imported, oriented Y-up, centered")
    return garment


def _fit_to_cage(garment: bpy.types.Object, inner_cage: bpy.types.Object) -> None:
    """Scale + position the garment so it sits on the standard body that the
    inner cage represents, so the WrapLayer maps it onto any avatar correctly."""
    import mathutils  # type: ignore

    def world_bb(o: bpy.types.Object):
        pts = [o.matrix_world @ mathutils.Vector(c) for c in o.bound_box]
        return pts

    ipts = world_bb(inner_cage)
    iy0 = min(v.y for v in ipts); iy1 = max(v.y for v in ipts)
    icx = (max(v.x for v in ipts) + min(v.x for v in ipts)) / 2
    icz = (max(v.z for v in ipts) + min(v.z for v in ipts)) / 2
    inner_h = iy1 - iy0

    gpts = world_bb(garment)
    gx0 = min(v.x for v in gpts); gx1 = max(v.x for v in gpts)
    gy0 = min(v.y for v in gpts); gy1 = max(v.y for v in gpts)
    gz0 = min(v.z for v in gpts); gz1 = max(v.z for v in gpts)
    g_h = gy1 - gy0
    g_horiz = max(gx1 - gx0, gz1 - gz0)
    # A tall garment (height dominant) is a full outfit / dress / pants → cover
    # most of the body; a compact one is a single top → upper-torso region.
    is_tall = g_h > 1.3 * g_horiz if g_horiz > 0.001 else False
    frac = 0.86 if is_tall else 0.42
    if g_h > 0.001:
        garment.data.transform(mathutils.Matrix.Scale((inner_h * frac) / g_h, 4))
        garment.data.update()

    gpts = [mathutils.Vector(c) for c in garment.bound_box]  # mesh-local == world (identity xform)
    gcx = (max(v.x for v in gpts) + min(v.x for v in gpts)) / 2
    gcz = (max(v.z for v in gpts) + min(v.z for v in gpts)) / 2
    gtop = max(v.y for v in gpts)
    top_target = iy1 - inner_h * 0.08  # just below the neck
    garment.data.transform(mathutils.Matrix.Translation((icx - gcx, top_target - gtop, icz - gcz)))
    garment.data.update()
    print(f"[generate_cages] fit_to_cage: inner_h={inner_h:.2f} is_tall={is_tall} frac={frac}")


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
    # Link into the SCENE MASTER collection. Linking to bpy.context.collection in
    # --background put the cages in a collection the glTF exporter didn't walk, so
    # only the garment exported. The scene master collection is always traversed.
    scene_coll = bpy.context.scene.collection
    for c in (inner, outer):
        for coll in list(c.users_collection):
            coll.objects.unlink(c)
        scene_coll.objects.link(c)
        # In the template the cages are parented to a 'Cage' empty that we do NOT
        # append. The glTF exporter only walks objects reachable from a root, so a
        # cage whose parent is missing from the scene gets silently dropped (only
        # the garment exported). Clear the parent (keep world transform) so each
        # cage is a root node the exporter sees. (The FBX exporter tolerated this;
        # glTF does not.)
        mw = c.matrix_world.copy()
        c.parent = None
        c.matrix_world = mw
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


def _make_cages_transparent(inner: bpy.types.Object, outer: bpy.types.Object) -> None:
    """Attach an alpha=0 material to inner/outer cage meshes.

    2026-05-22 (session 381) — user reported the FBX appears as a huge
    white blob in Workspace because Studio renders the cage meshes
    (which are full-body avatar shapes, ~5.5 studs tall) as opaque
    geometry. The actual ~1.8 stud garment is inside but obscured.

    Studio's layered-clothing system identifies cages by the
    `_InnerCage` / `_OuterCage` name suffix (not by visibility), so
    making the cages transparent only affects the standalone-drop
    scenario where the user drags the FBX into Workspace. When the FBX
    goes through Avatar Setup or is dropped onto a Rig, Studio still
    detects the cages and wires WrapLayer/WrapTarget — the deformation
    machinery is unaffected. The garment mesh keeps its own materials
    untouched.
    """
    trans_mat = bpy.data.materials.get("AIGold_CageTransparent")
    if trans_mat is None:
        trans_mat = bpy.data.materials.new(name="AIGold_CageTransparent")
        trans_mat.use_nodes = True
        bsdf = trans_mat.node_tree.nodes.get("Principled BSDF")
        if bsdf is not None:
            # Alpha=0 → fully transparent. Roblox FBX importer reads the
            # baseColor.A channel and maps it to MeshPart.Transparency.
            bsdf.inputs["Alpha"].default_value = 0.0
            # Also zero out the base colour alpha-channel so legacy
            # exporters that ignore the principled-BSDF Alpha input still
            # carry the transparency through.
            base = bsdf.inputs.get("Base Color")
            if base is not None and hasattr(base, "default_value"):
                base.default_value = (1.0, 1.0, 1.0, 0.0)
        trans_mat.blend_method = "BLEND"
        # Mark as the material the entire mesh uses (no mixed-material
        # rendering); single material slot → single MeshPart in Roblox.
        trans_mat.diffuse_color = (1.0, 1.0, 1.0, 0.0)

    for cage in (inner, outer):
        if cage.data is None:
            continue
        cage.data.materials.clear()
        cage.data.materials.append(trans_mat)


def _select_only(objects: list[bpy.types.Object]) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        # The template's cage meshes are hidden; a hidden object can't be
        # select_set(True), so use_selection export silently dropped them
        # (only the garment made it into the GLB). Unhide first.
        try:
            obj.hide_set(False)
        except Exception:  # noqa: BLE001 — object may not be in the view layer
            pass
        obj.hide_viewport = False
        obj.hide_render = False
        obj.select_set(True)
    if objects:
        bpy.context.view_layer.objects.active = objects[0]


def _export_glb(output_path: str, objects: list[bpy.types.Object]) -> None:
    """Export selected objects as a Roblox-compatible GLB.

    GLB (glTF binary) is used instead of FBX because it reliably carries Meshy's
    textures/colour through to Roblox's 3D importer — the FBX path imported as a
    plain white mesh (lost colour). export_yup converts Blender Z-up to the glTF
    Y-up that Roblox expects.
    """
    os.makedirs(os.path.dirname(os.path.abspath(output_path)) or ".", exist_ok=True)
    # _select_only also UNHIDES the objects (the template cages ship hidden).
    _select_only(objects)
    print(f"[generate_cages] scene objects at export: {[o.name for o in bpy.context.scene.objects]}")
    # 2026-06-02: export the WHOLE scene (use_selection=False), NOT the selection.
    # The glTF exporter's use_selection didn't pick up the cage meshes in headless
    # Blender (only the garment exported). The scene is clean here — _wipe_scene
    # left nothing, so the scene is exactly garment + inner cage + outer cage —
    # so exporting everything gives precisely the three meshes we want.
    bpy.ops.export_scene.gltf(
        filepath=output_path,
        export_format="GLB",
        use_selection=False,
        use_visible=False,
        export_yup=True,
        export_apply=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
    )


def main() -> int:
    args = _parse_args()
    print(f"[generate_cages] garment={args.garment}")
    print(f"[generate_cages] output={args.output}")
    print(f"[generate_cages] name={args.name}")
    print(f"[generate_cages] template={args.template}")
    print(f"[generate_cages] offset={args.offset}")
    print(f"[generate_cages] target_size={args.target_size}")

    _wipe_scene()
    garment = _import_garment(args.garment, target_name=args.name, target_size=args.target_size)
    print(f"[generate_cages] imported garment: {garment.name} "
          f"({len(garment.data.vertices)} verts, {len(garment.data.polygons)} polys)")

    # 2026-06-02 (session 403, round 2): ship garment + inner/outer cages as a
    # colour-preserving GLB. Roblox layered clothing WRAPS via the cage system
    # (WrapLayer), so a garment-only mesh just glues flat — we need the cages.
    # The user imports this via Avatar -> Import 3D (NOT a raw drag): the 3D
    # Importer recognises the <name>_InnerCage / <name>_OuterCage meshes and
    # builds the WrapLayer so the clothing wraps the body, like a real UGC item.
    inner, outer = _append_cages(args.template)
    print(f"[generate_cages] appended cages: {inner.name}, {outer.name}")
    _fit_to_cage(garment, inner)
    _shrinkwrap_outer_cage(outer, garment, args.offset)
    _name_cages(inner, outer, args.name)
    _make_cages_transparent(inner, outer)
    _export_glb(args.output, [garment, inner, outer])
    size_bytes = os.path.getsize(args.output)
    print(f"[generate_cages] exported {args.output} ({size_bytes:,} bytes) "
          f"with cages {inner.name}/{outer.name}")
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
