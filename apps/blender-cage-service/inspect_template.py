"""
inspect_template.py — one-off: dump what's inside Clothing_Cage_Template.blend
so we know whether it ships an R15 armature + a rigged body (for skin-weight
transfer) or only the cage meshes. Run headless:

    blender --background --python inspect_template.py -- /path/to/template.blend
"""
from __future__ import annotations
import sys
import bpy  # type: ignore


def _path() -> str:
    if "--" in sys.argv:
        rest = sys.argv[sys.argv.index("--") + 1:]
        if rest:
            return rest[0]
    raise SystemExit("no template path passed after --")


def main() -> int:
    tpl = _path()
    print(f"[inspect] opening {tpl}")
    bpy.ops.wm.open_mainfile(filepath=tpl)
    print("=== OBJECTS ===")
    for o in bpy.data.objects:
        line = f"OBJ name={o.name!r} type={o.type}"
        if o.parent:
            line += f" parent={o.parent.name!r}({o.parent.type})"
        if o.type == "MESH":
            vgs = [g.name for g in o.vertex_groups]
            line += f" verts={len(o.data.vertices)} vgroups({len(vgs)})={vgs[:60]}"
            line += f" mods={[m.type for m in o.modifiers]}"
            line += f" materials={[m.name for m in o.data.materials if m]}"
        if o.type == "ARMATURE":
            line += f" bones={[b.name for b in o.data.bones]}"
        print(line)
    print("=== MESHES (data) ===")
    for m in bpy.data.meshes:
        print(f"MESH data name={m.name!r} verts={len(m.vertices)}")
    print("=== ARMATURES (data) ===")
    for a in bpy.data.armatures:
        print(f"ARMATURE data name={a.name!r} bones={[b.name for b in a.bones]}")
    print("=== END ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())
