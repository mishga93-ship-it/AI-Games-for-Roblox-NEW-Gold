#!/usr/bin/env python3
"""
render_animation_preview_pil.py
Generates an animated GIF preview of a Roblox animation using Pillow.
No Blender or OpenGL required — works reliably in headless Cloud Run.

Usage:
    python3 render_animation_preview_pil.py <input_keyframes.json> <output.gif>

Output format (stdout):
    BLENDER_RESULT:{"success": true, "framesRendered": N}
"""

import sys
import json
import math
import os

try:
    from PIL import Image, ImageDraw
    import imageio
except ImportError as e:
    print(f"BLENDER_RESULT:{json.dumps({'success': False, 'error': str(e)})}")
    sys.exit(1)


# ── Canvas (landscape to fill iOS 200px-height wide view without black bars) ──
OUT_W, OUT_H = 320, 200     # final output size
SCALE = 2                   # render at 2x for anti-aliasing
W, H = OUT_W * SCALE, OUT_H * SCALE  # 640 × 400

BG_COLOR = (240, 232, 252)      # light lavender
GRID_COLOR = (228, 218, 244)    # subtle grid
FIGURE_COLOR = (110, 48, 172)   # purple

# Figure proportions at 2x
HEAD_R    = 30
TORSO_H   = 76
SHD_W     = 38   # shoulder half-width
HIP_W     = 26   # hip half-width
UA_LEN    = 52   # upper arm
LA_LEN    = 40   # lower arm
UL_LEN    = 54   # upper leg
LL_LEN    = 44   # lower leg
LW        = 10   # limb line width
LW_FORE   = 8    # forearm/lower-leg width


# ── Joint aliases ─────────────────────────────────────────────────────────────
ALIASES = {
    'waist':          'UpperTorso',
    'neck':           'Head',
    'leftshoulder':   'LeftUpperArm',
    'rightshoulder':  'RightUpperArm',
    'leftelbow':      'LeftLowerArm',
    'rightelbow':     'RightLowerArm',
    'leftwrist':      'LeftHand',
    'rightwrist':     'RightHand',
    'lefthip':        'LeftUpperLeg',
    'righthip':       'RightUpperLeg',
    'leftknee':       'LeftLowerLeg',
    'rightknee':      'RightLowerLeg',
    'leftankle':      'LeftFoot',
    'rightankle':     'RightFoot',
}

def norm_joint(name):
    return ALIASES.get(name.lower(), name)

def parse_poses(poses_list):
    out = {}
    for p in poses_list:
        j = norm_joint(str(p.get('joint', '')))
        cf = p.get('cframe', {})
        out[j] = {
            'rx': float(cf.get('rx', 0)),
            'ry': float(cf.get('ry', 0)),
            'rz': float(cf.get('rz', 0)),
            'x':  float(cf.get('x',  0)),
            'y':  float(cf.get('y',  0)),
        }
    return out


# ── Angle helpers (0 = UP, π = DOWN, π/2 = RIGHT, -π/2 = LEFT) ───────────────
def pt(ox, oy, angle, length):
    """Endpoint from origin along compass-style angle (0=up, clockwise)."""
    return (ox + math.sin(angle) * length,
            oy - math.cos(angle) * length)

def clamp(v, lo, hi):
    return max(lo, min(hi, v))

def safe_line(draw, p0, p1, color, width):
    """Draw line with integer-clamped coordinates."""
    x0 = clamp(int(p0[0]), 0, W - 1)
    y0 = clamp(int(p0[1]), 0, H - 1)
    x1 = clamp(int(p1[0]), 0, W - 1)
    y1 = clamp(int(p1[1]), 0, H - 1)
    draw.line([(x0, y0), (x1, y1)], fill=color, width=width)


# ── Draw one frame ─────────────────────────────────────────────────────────────
def draw_frame(poses):
    img = Image.new('RGB', (W, H), BG_COLOR)
    draw = ImageDraw.Draw(img)

    # Grid
    step = 80
    for x in range(0, W, step):
        draw.line([(x, 0), (x, H)], fill=GRID_COLOR, width=1)
    for y in range(0, H, step):
        draw.line([(0, y), (W, y)], fill=GRID_COLOR, width=1)

    # Root Y offset (jump / crouch) — clamped to ±35 px at 2x
    root = poses.get('HumanoidRootPart', {})
    y_raw = root.get('y', 0)
    y_shift = clamp(int(-y_raw * 18), -35, 35)

    # Anchor points (centered horizontally, lower-middle vertically)
    cx   = W // 2
    hip_y = int(H * 0.68) + y_shift
    shl_y = hip_y - TORSO_H     # shoulder y
    head_cy = shl_y - HEAD_R - 6

    # ── Head ──
    draw.ellipse([cx - HEAD_R, head_cy - HEAD_R,
                  cx + HEAD_R, head_cy + HEAD_R],
                 fill=FIGURE_COLOR)

    # ── Neck ──
    safe_line(draw, (cx, head_cy + HEAD_R), (cx, shl_y), FIGURE_COLOR, LW)

    # ── Shoulders bar ──
    safe_line(draw, (cx - SHD_W, shl_y), (cx + SHD_W, shl_y), FIGURE_COLOR, LW)

    # ── Torso ──
    safe_line(draw, (cx, shl_y), (cx, hip_y), FIGURE_COLOR, LW)

    # ── Hips bar ──
    safe_line(draw, (cx - HIP_W, hip_y), (cx + HIP_W, hip_y), FIGURE_COLOR, LW)

    # ── LEFT ARM ──────────────────────────────────────────────────────────────
    # Base direction: pointing LEFT  (-π/2). rx < 0 → arm raises up.
    la_rx  = poses.get('LeftUpperArm',  {}).get('rx', 0)
    lla_rx = poses.get('LeftLowerArm',  {}).get('rx', 0)

    la_origin = (cx - SHD_W, shl_y)
    la_angle   = -math.pi / 2 + la_rx           # negative rx → angle more negative → UP
    la_end     = pt(*la_origin, la_angle, UA_LEN)
    safe_line(draw, la_origin, la_end, FIGURE_COLOR, LW)

    la2_angle  = la_angle + lla_rx
    la2_end    = pt(*la_end, la2_angle, LA_LEN)
    safe_line(draw, la_end, la2_end, FIGURE_COLOR, LW_FORE)

    # ── RIGHT ARM ─────────────────────────────────────────────────────────────
    # Base direction: pointing RIGHT (π/2). rx < 0 → arm raises up.
    ra_rx  = poses.get('RightUpperArm', {}).get('rx', 0)
    rla_rx = poses.get('RightLowerArm', {}).get('rx', 0)

    ra_origin = (cx + SHD_W, shl_y)
    ra_angle   = math.pi / 2 - ra_rx            # negative rx → angle smaller → UP
    ra_end     = pt(*ra_origin, ra_angle, UA_LEN)
    safe_line(draw, ra_origin, ra_end, FIGURE_COLOR, LW)

    ra2_angle  = ra_angle - rla_rx
    ra2_end    = pt(*ra_end, ra2_angle, LA_LEN)
    safe_line(draw, ra_end, ra2_end, FIGURE_COLOR, LW_FORE)

    # ── LEFT LEG ──────────────────────────────────────────────────────────────
    # Base direction: DOWN (0). rx > 0 → leg swings forward (right on screen for left leg).
    ll_rx  = poses.get('LeftUpperLeg',  {}).get('rx', 0)
    lll_rx = poses.get('LeftLowerLeg',  {}).get('rx', 0)

    ll_origin = (cx - HIP_W, hip_y)
    ll_angle   = 0 + ll_rx
    ll_end     = pt(*ll_origin, ll_angle, UL_LEN)
    safe_line(draw, ll_origin, ll_end, FIGURE_COLOR, LW)

    ll2_angle  = ll_angle + lll_rx
    ll2_end    = pt(*ll_end, ll2_angle, LL_LEN)
    safe_line(draw, ll_end, ll2_end, FIGURE_COLOR, LW_FORE)

    # ── RIGHT LEG ─────────────────────────────────────────────────────────────
    rl_rx  = poses.get('RightUpperLeg', {}).get('rx', 0)
    rll_rx = poses.get('RightLowerLeg', {}).get('rx', 0)

    rl_origin = (cx + HIP_W, hip_y)
    rl_angle   = 0 - rl_rx
    rl_end     = pt(*rl_origin, rl_angle, UL_LEN)
    safe_line(draw, rl_origin, rl_end, FIGURE_COLOR, LW)

    rl2_angle  = rl_angle - rll_rx
    rl2_end    = pt(*rl_end, rl2_angle, LL_LEN)
    safe_line(draw, rl_end, rl2_end, FIGURE_COLOR, LW_FORE)

    # Downscale 2x → 1x for anti-aliasing
    return img.resize((OUT_W, OUT_H), Image.LANCZOS)


# ── Interpolation ─────────────────────────────────────────────────────────────
def lerp_poses(a, b, t):
    joints = set(a) | set(b)
    return {
        j: {k: a.get(j, {}).get(k, 0) * (1 - t) + b.get(j, {}).get(k, 0) * t
            for k in ('rx', 'ry', 'rz', 'x', 'y')}
        for j in joints
    }


# ── Main ───────────────────────────────────────────────────────────────────────
def main():
    if len(sys.argv) < 3:
        print("Usage: render_animation_preview_pil.py <input.json> <output.gif>",
              file=sys.stderr)
        sys.exit(1)

    input_path, output_path = sys.argv[1], sys.argv[2]

    with open(input_path) as f:
        data = json.load(f)

    raw_kf = data.get('keyframes', [])
    if not raw_kf:
        print(f"BLENDER_RESULT:{json.dumps({'success': False, 'error': 'no keyframes'})}")
        sys.exit(1)

    # Parse & sort
    parsed = sorted(
        [(float(kf.get('time', 0)), parse_poses(kf.get('poses', []))) for kf in raw_kf],
        key=lambda x: x[0]
    )

    # Animation duration: clamp 0.5 – 3 s
    anim_end = max(0.5, min(float(parsed[-1][0]), 3.0))
    TARGET_FPS = 15
    total_frames = max(8, int(anim_end * TARGET_FPS))

    frames_out = []
    for fi in range(total_frames):
        t = (fi / total_frames) * anim_end

        # Find bracketing keyframes
        poses = parsed[0][1]
        for i in range(len(parsed) - 1):
            t0, p0 = parsed[i]
            t1, p1 = parsed[i + 1]
            if t0 <= t <= t1:
                span = t1 - t0
                poses = lerp_poses(p0, p1, (t - t0) / span if span > 0 else 0)
                break
            elif t > t1:
                poses = p1

        frames_out.append(draw_frame(poses))

    # Write GIF
    imageio.mimwrite(
        output_path,
        frames_out,
        format='GIF',
        duration=1.0 / TARGET_FPS,
        loop=0,
    )

    size = os.path.getsize(output_path)
    print(f"BLENDER_RESULT:{json.dumps({'success': True, 'framesRendered': total_frames, 'fileSizeBytes': size})}")


if __name__ == '__main__':
    main()
