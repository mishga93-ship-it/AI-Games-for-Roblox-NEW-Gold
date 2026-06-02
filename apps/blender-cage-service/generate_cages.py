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
    # Apply transforms so the mesh data carries its final coordinates before we
    # measure / rescale it.
    bpy.ops.object.select_all(action="DESELECT")
    garment.select_set(True)
    bpy.context.view_layer.objects.active = garment
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    import mathutils  # type: ignore

    # 2026-06-02 (session 403): the pipeline ships a clean GARMENT-ONLY GLB that
    # keeps Meshy's colour/textures; the user fits it in Studio's Accessory
    # Fitting Tool. Two jobs here: (1) rescale to a sane stud size, (2) recenter.
    #
    # Scale by the LONGEST axis (orientation-independent — Meshy output
    # orientation is not guaranteed). `target_size` is passed by the backend and
    # depends on the garment type: full outfit ~5 studs (covers the body), single
    # top ~2.5. Raw Meshy meshes are only ~1-2 units and import tiny next to a
    # ~5-stud avatar, so this rescale is what makes the clothing the right size.
    # No more -90°X rotation / cage alignment — keep Meshy's own upright
    # orientation and let glTF export handle Z-up -> Y-up.
    bbox = [mathutils.Vector(corner) for corner in garment.bound_box]
    xs = [v.x for v in bbox]; ys = [v.y for v in bbox]; zs = [v.z for v in bbox]
    x_dim = max(xs) - min(xs); y_dim = max(ys) - min(ys); z_dim = max(zs) - min(zs)
    cur_max_dim = max(x_dim, y_dim, z_dim)
    # glTF import leaves the model Z-up in Blender, so Z is the vertical axis.
    # A TALL figure (Z clearly dominant) is a full outfit / dress / pants that
    # should span most of the avatar body (~4.6 studs). A COMPACT mesh is a
    # single top → torso-sized (`target_size`, default ~2.6). This mesh-shape
    # test is more reliable than the clothingType label — a full outfit is often
    # tagged "layered_shirt" by the interview, so we can't trust the label.
    horiz_max = max(x_dim, y_dim)
    is_tall_figure = (z_dim > 1.3 * horiz_max) if horiz_max > 0.001 else False
    effective_target = 4.6 if is_tall_figure else target_size
    if cur_max_dim > 0.001:
        scale = effective_target / cur_max_dim
        garment.data.transform(mathutils.Matrix.Scale(scale, 4))
        print(f"[generate_cages] rescale: longest {cur_max_dim:.3f} -> {cur_max_dim * scale:.3f} "
              f"studs (tall_figure={is_tall_figure}, target {effective_target}, x{scale:.4f})")
    # Recenter the bbox on the origin — neutral; the user positions it on the
    # avatar in the Accessory Fitting Tool.
    bbox2 = [mathutils.Vector(corner) for corner in garment.bound_box]
    cx = (max(v.x for v in bbox2) + min(v.x for v in bbox2)) / 2
    cy = (max(v.y for v in bbox2) + min(v.y for v in bbox2)) / 2
    cz = (max(v.z for v in bbox2) + min(v.z for v in bbox2)) / 2
    garment.data.transform(mathutils.Matrix.Translation((-cx, -cy, -cz)))
    garment.data.update()
    print("[generate_cages] centered garment at origin")
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
    _select_only(objects)
    bpy.ops.export_scene.gltf(
        filepath=output_path,
        export_format="GLB",
        use_selection=True,
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

    # 2026-06-02 (session 403): export a clean GARMENT-ONLY GLB — keeps Meshy's
    # colour/textures (FBX lost them) and is rescaled to target_size. No bundled
    # body cages: they rendered as huge white blobs on a raw drag and only become
    # invisible cage-data when wired by the Accessory Fitting Tool. The user fits
    # this clean mesh in the AFT, which generates its own cages.
    # (_append_cages / _shrinkwrap_outer_cage stay above for reference / a
    # possible future auto-wrap path.)
    _export_glb(args.output, [garment])
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
