"""verify_fbx.py — load an FBX, list objects + vertex counts, sanity-check."""

from __future__ import annotations
import argparse
import sys
import bpy  # type: ignore


def _strip() -> list[str]:
    if "--" not in sys.argv:
        return []
    return sys.argv[sys.argv.index("--") + 1:]


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--fbx", required=True)
    args = p.parse_args(_strip())

    # Clear scene first.
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    bpy.ops.import_scene.fbx(filepath=args.fbx)
    print("---- FBX contents ----")
    for obj in bpy.context.scene.objects:
        verts = len(obj.data.vertices) if obj.type == "MESH" and obj.data else 0
        polys = len(obj.data.polygons) if obj.type == "MESH" and obj.data else 0
        bb_min = [round(c, 3) for c in obj.bound_box[0]]
        bb_max = [round(c, 3) for c in obj.bound_box[6]]
        print(f"  {obj.name:<40} {obj.type:<10} verts={verts:<6} polys={polys:<6} bbox={bb_min}→{bb_max}")
    print("----")
    return 0


if __name__ == "__main__":
    sys.exit(main())
