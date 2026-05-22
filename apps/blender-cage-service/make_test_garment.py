"""
make_test_garment.py — create a tiny test garment .glb so we can smoke-test
generate_cages.py without needing a real Meshy output handy.

Builds a primitive "torso shell": a low-poly sphere flattened into a
shirt-like silhouette, sized roughly to a Roblox R15 chest (≈3 studs tall).

Usage:
    blender --background --python make_test_garment.py -- --output /tmp/test_garment.glb
"""

from __future__ import annotations
import argparse
import os
import sys
import bpy  # type: ignore


def _strip_argv_before_doubledash() -> list[str]:
    if "--" not in sys.argv:
        return []
    return sys.argv[sys.argv.index("--") + 1:]


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--output", required=True)
    args = p.parse_args(_strip_argv_before_doubledash())

    # Wipe default scene.
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    # Add a UV sphere ~3 studs tall, then scale Z to make a torso silhouette.
    bpy.ops.mesh.primitive_uv_sphere_add(radius=1.0, segments=16, ring_count=8, location=(0, 0, 1.5))
    obj = bpy.context.active_object
    obj.name = "TestGarment"
    obj.scale = (1.0, 0.5, 1.5)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # Export.
    os.makedirs(os.path.dirname(os.path.abspath(args.output)) or ".", exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=args.output,
        export_format="GLB",
        use_selection=False,
        export_materials="EXPORT",
        export_apply=True,
    )
    print(f"[make_test_garment] wrote {args.output} "
          f"({os.path.getsize(args.output):,} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
