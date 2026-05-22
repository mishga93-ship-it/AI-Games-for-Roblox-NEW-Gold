"""
server.py — minimal HTTP server wrapping generate_cages.py for Cloud Run.

POST /cage
  body: { "garmentUrl": "https://...glb", "name": "MyJacket", "offset": 0.005 }
  resp: { "fbxBase64": "...", "logs": "..." }
  errs: { "error": "...", "logs": "..." } at 500

GET  /healthz → 200 OK

The server runs the heavy Blender invocation as a subprocess; Cloud Run
allocates one job at a time per instance and Blender 4.x in headless mode
takes ~5-15s per cage generation, so single-flight is fine.
"""

from __future__ import annotations

import base64
import json
import os
import shutil
import subprocess
import tempfile
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("PORT", "8080"))
SCRIPT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "generate_cages.py")
TEMPLATE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "Clothing_Cage_Template.blend")
VEHICLE_FIX_SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vehicle_fix.py")
BLENDER_BIN = os.environ.get("BLENDER_BIN", "/usr/local/blender/blender")


def _download(url: str, dest: str) -> None:
    """Stream the garment .glb to disk so Blender can read it."""
    req = urllib.request.Request(url, headers={"User-Agent": "blender-cage-service/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp, open(dest, "wb") as out:
        shutil.copyfileobj(resp, out)


def _run_blender(garment_path: str, output_path: str, name: str, offset: float) -> tuple[int, str]:
    """Invoke Blender headless. Returns (exit_code, combined_stdout_stderr)."""
    cmd = [
        BLENDER_BIN,
        "--background",
        "--python", SCRIPT_PATH,
        "--",
        "--garment", garment_path,
        "--output", output_path,
        "--name", name,
        "--template", TEMPLATE_PATH,
        "--offset", str(offset),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    combined = proc.stdout + "\n" + proc.stderr
    return proc.returncode, combined


def _run_blender_vehicle_fix(
    input_path: str,
    output_path: str,
    primary_hex: str,
    accent_hex: str,
    preview_png_path: str = "",
) -> tuple[int, str]:
    """Invoke vehicle_fix.py headless. Same subprocess pattern as cages.

    Round 19: when preview_png_path is non-empty, Blender also writes a
    3/4-front PNG render to that path so the backend can ship it to Claude
    vision for QA scoring. Empty path = skip render (legacy fast path)."""
    cmd = [
        BLENDER_BIN,
        "--background",
        "--python", VEHICLE_FIX_SCRIPT,
        "--",
        "--input", input_path,
        "--output", output_path,
        "--primary-hex", primary_hex,
        "--accent-hex", accent_hex,
    ]
    if preview_png_path:
        cmd.extend(["--preview-png", preview_png_path])
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=240)
    combined = proc.stdout + "\n" + proc.stderr
    return proc.returncode, combined


class Handler(BaseHTTPRequestHandler):
    # Quieter logs — Cloud Run already captures stdout.
    def log_message(self, fmt: str, *args) -> None:  # noqa: D401
        return

    def _send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802 (BaseHTTPRequestHandler API)
        if self.path == "/healthz" or self.path == "/":
            self._send_json(200, {"ok": True, "service": "blender-cage-service"})
            return
        self._send_json(404, {"error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path == "/vehicle-fix":
            return self._handle_vehicle_fix()
        if self.path != "/cage":
            self._send_json(404, {"error": "not found"})
            return
        length = int(self.headers.get("Content-Length", "0"))
        try:
            raw = self.rfile.read(length).decode("utf-8") if length else "{}"
            body = json.loads(raw)
        except json.JSONDecodeError as err:
            self._send_json(400, {"error": f"invalid json: {err}"})
            return

        garment_url = body.get("garmentUrl")
        name = body.get("name") or "Garment"
        offset = float(body.get("offset", 0.005))
        if not garment_url:
            self._send_json(400, {"error": "garmentUrl is required"})
            return

        # Sanitise name → alpha-numeric + underscore so Studio FBX import
        # doesn't choke on weird object names (Roblox spec: ASCII identifier).
        safe_name = "".join(c if c.isalnum() else "_" for c in name).strip("_") or "Garment"

        workdir = tempfile.mkdtemp(prefix="cage-")
        garment_path = os.path.join(workdir, "garment.glb")
        output_path = os.path.join(workdir, f"{safe_name}.fbx")
        try:
            _download(garment_url, garment_path)
            code, logs = _run_blender(garment_path, output_path, safe_name, offset)
            if code != 0 or not os.path.exists(output_path):
                self._send_json(500, {
                    "error": f"blender exit code {code}",
                    "logs": logs[-4000:],
                })
                return
            with open(output_path, "rb") as f:
                fbx_b64 = base64.b64encode(f.read()).decode("ascii")
            self._send_json(200, {
                "fbxBase64": fbx_b64,
                "fbxBytes": os.path.getsize(output_path),
                "logs": logs[-2000:],
            })
        except Exception as err:  # noqa: BLE001
            self._send_json(500, {"error": str(err)})
        finally:
            shutil.rmtree(workdir, ignore_errors=True)

    def _handle_vehicle_fix(self) -> None:  # noqa: D401
        """POST /vehicle-fix — Phase A preprocessor for Meshy vehicle GLBs.

        Body:
            {
                "glbUrl": "https://.../meshy-output.glb",
                "primaryHex": "#E03A2E",
                "accentHex": "#15161A"
            }

        Returns base64-encoded cleaned GLB so the calling backend can
        re-upload to Roblox Open Cloud without needing inter-service
        Storage credentials. Matches the /cage endpoint base64 pattern.
        """
        length = int(self.headers.get("Content-Length", "0"))
        try:
            raw = self.rfile.read(length).decode("utf-8") if length else "{}"
            body = json.loads(raw)
        except json.JSONDecodeError as err:
            self._send_json(400, {"error": f"invalid json: {err}"})
            return
        glb_url = body.get("glbUrl")
        primary_hex = (body.get("primaryHex") or "").strip()
        accent_hex = (body.get("accentHex") or "").strip()
        # Round 19: caller opts into Visual QA gate by passing renderPreview=true.
        # Adds ~2-5s to the response (EEVEE Next render on Cloud Run CPU) and
        # returns previewPngBase64 alongside the cleaned GLB. Legacy callers
        # that omit the flag still get the old fast path with no PNG render.
        render_preview = bool(body.get("renderPreview"))
        if not glb_url:
            self._send_json(400, {"error": "glbUrl is required"})
            return
        workdir = tempfile.mkdtemp(prefix="vehicle-fix-")
        input_path = os.path.join(workdir, "input.glb")
        output_path = os.path.join(workdir, "cleaned.glb")
        preview_path = os.path.join(workdir, "preview.png") if render_preview else ""
        try:
            _download(glb_url, input_path)
            code, logs = _run_blender_vehicle_fix(
                input_path, output_path, primary_hex, accent_hex, preview_path,
            )
            if code != 0 or not os.path.exists(output_path):
                self._send_json(500, {
                    "error": f"blender exit code {code}",
                    "logs": logs[-4000:],
                })
                return
            with open(output_path, "rb") as f:
                glb_b64 = base64.b64encode(f.read()).decode("ascii")
            payload: dict = {
                "glbBase64": glb_b64,
                "glbBytes": os.path.getsize(output_path),
                "logs": logs[-2000:],
            }
            if render_preview and preview_path and os.path.exists(preview_path):
                with open(preview_path, "rb") as pf:
                    payload["previewPngBase64"] = base64.b64encode(pf.read()).decode("ascii")
                payload["previewPngBytes"] = os.path.getsize(preview_path)
            elif render_preview:
                # Render was requested but failed (Blender printed log, returned 0).
                # Caller treats missing previewPngBase64 as "QA gate unavailable"
                # → falls through without re-generating.
                payload["previewPngError"] = "preview render did not produce a PNG (see logs)"
            self._send_json(200, payload)
        except Exception as err:  # noqa: BLE001
            self._send_json(500, {"error": str(err)})
        finally:
            shutil.rmtree(workdir, ignore_errors=True)


def main() -> None:
    print(f"[blender-cage-service] listening on :{PORT}")
    print(f"[blender-cage-service] BLENDER_BIN={BLENDER_BIN}")
    print(f"[blender-cage-service] SCRIPT_PATH={SCRIPT_PATH}")
    print(f"[blender-cage-service] TEMPLATE_PATH={TEMPLATE_PATH}")
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    server.serve_forever()


if __name__ == "__main__":
    main()
