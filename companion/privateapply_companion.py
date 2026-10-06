#!/usr/bin/env python3
"""
PrivateApply Linux Native Messaging Companion
Provides safe, local TeX compilation for the PrivateApply browser extension
communicating over Chrome / Firefox Native Messaging standard I/O framing.
"""

import sys
import os
import struct
import json
import shutil
import subprocess
import tempfile
import time
import base64
import re
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple

VERSION = "1.0.0"
PROTOCOL_VERSION = 1

# Resource & security limits
MAX_SOURCE_SIZE = 2 * 1024 * 1024       # 2 MB max .tex source
MAX_TOTAL_ASSETS_SIZE = 10 * 1024 * 1024 # 10 MB total assets
MAX_ASSET_COUNT = 30                    # Max 30 files in project
MAX_PDF_RETURN_SIZE = 750 * 1024        # 750 KB for single message base64 payload
DEFAULT_TIMEOUT_SECS = 30
MAX_TIMEOUT_SECS = 120
MAX_DIAGNOSTIC_EXCERPT_CHARS = 16 * 1024

LOG_FILE_PATH = Path.home() / ".cache" / "privateapply" / "companion.log"

def log_debug(msg: str):
    """Write diagnostic messages ONLY to stderr or log file. NEVER TO STDOUT."""
    try:
        LOG_FILE_PATH.parent.mkdir(parents=True, exist_ok=True)
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        with open(LOG_FILE_PATH, "a", encoding="utf-8") as f:
            f.write(f"[{timestamp}] {msg}\n")
    except Exception:
        pass
    print(f"[PrivateApply Companion] {msg}", file=sys.stderr, flush=True)

# ── Native Messaging Framing ──────────────────────────────────────────────────

def read_message() -> Optional[Dict[str, Any]]:
    """
    Read a 4-byte native-endian length-prefixed JSON message from stdin.
    Returns parsed dict, or None on EOF / disconnect.
    """
    raw_length = sys.stdin.buffer.read(4)
    if len(raw_length) < 4:
        return None
    message_length = struct.unpack("=I", raw_length)[0]
    if message_length == 0:
        return {}
    if message_length > 10 * 1024 * 1024:
        log_debug(f"Message length exceeds 10MB limit: {message_length} bytes")
        return None
    raw_data = sys.stdin.buffer.read(message_length)
    if len(raw_data) < message_length:
        return None
    try:
        return json.loads(raw_data.decode("utf-8"))
    except Exception as e:
        log_debug(f"Failed to decode incoming JSON: {e}")
        return None

def send_message(response: Dict[str, Any]) -> None:
    """
    Write a 4-byte native-endian length-prefixed JSON message to stdout.
    """
    encoded = json.dumps(response).encode("utf-8")
    length = len(encoded)
    sys.stdout.buffer.write(struct.pack("=I", length))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()

# ── TeX Engine Detection ──────────────────────────────────────────────────────

SUPPORTED_ENGINES = ["latexmk", "pdflatex", "xelatex", "lualatex"]

def detect_installed_engines() -> Dict[str, Dict[str, Any]]:
    """
    Detect availability and paths for supported TeX compiler engines.
    """
    results = {}
    for engine in SUPPORTED_ENGINES:
        path = shutil.which(engine)
        if path:
            version_str = "Installed"
            try:
                proc = subprocess.run([path, "--version"], capture_output=True, text=True, timeout=3)
                if proc.stdout:
                    first_line = proc.stdout.splitlines()[0].strip()
                    version_str = first_line[:60]
            except Exception:
                pass
            results[engine] = {
                "available": True,
                "path": path,
                "version": version_str
            }
        else:
            results[engine] = {
                "available": False,
                "path": None,
                "version": None
            }
    return results

def get_best_available_engine(preferred: Optional[str] = None) -> Optional[str]:
    engines = detect_installed_engines()
    if preferred and preferred in engines and engines[preferred]["available"]:
        return preferred
    # Default order: latexmk -> pdflatex -> xelatex -> lualatex
    for candidate in ["latexmk", "pdflatex", "xelatex", "lualatex"]:
        if engines.get(candidate, {}).get("available"):
            return candidate
    return None

# ── Security & Path Validation ────────────────────────────────────────────────

SAFE_FILENAME_RE = re.compile(r"^[a-zA-Z0-9_\-\.]+$")

def validate_safe_filename(name: str) -> bool:
    """Ensure filenames contain no path separators, traversal characters, or null bytes."""
    if not name or len(name) > 120:
        return False
    if "/" in name or "\\" in name or "\0" in name:
        return False
    if name in (".", "..") or name.startswith(".."):
        return False
    return bool(SAFE_FILENAME_RE.match(name))

# ── Compiler Diagnostics Parser ───────────────────────────────────────────────

def parse_compiler_diagnostics(log_content: str, stdout_content: str, stderr_content: str) -> Dict[str, Any]:
    """
    Extract structured errors, line numbers, warnings, and missing package cues from TeX logs.
    Handles both -file-line-error format (file:line: error) and classic (! error) formats.
    """
    errors: List[Dict[str, Any]] = []
    warnings: List[str] = []
    missing_packages: List[str] = []

    combined = (log_content + "\n" + stdout_content + "\n" + stderr_content)

    # Detect missing packages: e.g. "! LaTeX Error: File `XYZ.sty' not found."
    missing_pkg_pattern = re.compile(r"! LaTeX Error: File ['`]([^'`]+\.(?:sty|cls))['`] not found", re.IGNORECASE)
    for match in missing_pkg_pattern.finditer(combined):
        pkg = match.group(1).strip()
        if pkg not in missing_packages:
            missing_packages.append(pkg)

    # File-line-error regex: e.g. ./document.tex:14: Undefined control sequence.
    fle_pattern = re.compile(r"^(?:\./)?(?:[a-zA-Z0-9_\-\.]+):(\d+):\s*(.+)$")

    lines = log_content.splitlines() if log_content else stdout_content.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        
        # 1. Check file-line-error style
        fle_match = fle_pattern.match(line)
        if fle_match:
            line_no = int(fle_match.group(1))
            err_msg = fle_match.group(2).strip()
            # If the error is fatal marker, skip or keep as summary
            if not err_msg.startswith("==> Fatal error"):
                context_lines = []
                j = i + 1
                while j < min(i + 6, len(lines)):
                    next_l = lines[j].strip()
                    if next_l.startswith("l.") or next_l.startswith("..."):
                        context_lines.append(next_l)
                    elif fle_pattern.match(next_l) or next_l.startswith("!"):
                        break
                    j += 1
                errors.append({
                    "message": err_msg,
                    "line": line_no,
                    "context": " ".join(context_lines)[:200] if context_lines else None
                })
            i += 1
            continue

        # 2. Check classic "! " style
        if line.startswith("!"):
            error_msg = line[1:].strip()
            line_no = None
            context_lines = []
            j = i + 1
            while j < min(i + 8, len(lines)):
                next_line = lines[j].strip()
                line_match = re.match(r"^l\.(\d+)\s*(.*)", next_line)
                if line_match:
                    line_no = int(line_match.group(1))
                    context_lines.append(line_match.group(2).strip())
                    break
                elif next_line and not next_line.startswith("!"):
                    context_lines.append(next_line)
                j += 1
            errors.append({
                "message": error_msg,
                "line": line_no,
                "context": " ".join(context_lines)[:200] if context_lines else None
            })
            i = j
            continue

        if "Warning:" in line and len(warnings) < 15:
            warnings.append(line[:150])

        i += 1

    return {
        "errors": errors[:20],
        "warnings": warnings[:15],
        "missing_packages": missing_packages,
        "log_excerpt": combined[-MAX_DIAGNOSTIC_EXCERPT_CHARS:] if combined else ""
    }

# ── LaTeX Compilation ─────────────────────────────────────────────────────────

def run_latex_compilation(
    source: str,
    engine: str = "auto",
    assets: Optional[Dict[str, str]] = None,
    timeout_secs: int = DEFAULT_TIMEOUT_SECS
) -> Dict[str, Any]:
    """
    Perform isolated compilation in a temporary directory with security parameters.
    """
    start_time = time.time()

    # 1. Resource limit checks
    if len(source.encode("utf-8")) > MAX_SOURCE_SIZE:
        return {
            "success": False,
            "error_type": "RESOURCE_LIMIT",
            "message": f"Source document exceeds maximum allowed size of {MAX_SOURCE_SIZE // 1024} KB.",
            "duration_ms": 0,
        }

    total_assets_size = sum(len(v) for v in (assets or {}).values())
    if total_assets_size > MAX_TOTAL_ASSETS_SIZE:
        return {
            "success": False,
            "error_type": "RESOURCE_LIMIT",
            "message": f"Project assets exceed maximum size of {MAX_TOTAL_ASSETS_SIZE // (1024 * 1024)} MB.",
            "duration_ms": 0,
        }

    if assets and len(assets) > MAX_ASSET_COUNT:
        return {
            "success": False,
            "error_type": "RESOURCE_LIMIT",
            "message": f"Too many asset files ({len(assets)}). Maximum allowed is {MAX_ASSET_COUNT}.",
            "duration_ms": 0,
        }

    # 2. Engine selection
    selected_engine = get_best_available_engine(None if engine == "auto" else engine)
    if not selected_engine:
        engines_status = detect_installed_engines()
        return {
            "success": False,
            "error_type": "NO_ENGINE",
            "message": "No supported LaTeX compiler found on your Linux system. Please install latexmk or texlive.",
            "available_engines": engines_status,
            "duration_ms": 0,
        }

    timeout_secs = max(5, min(int(timeout_secs), MAX_TIMEOUT_SECS))

    # 3. Create isolated build directory
    build_dir = tempfile.mkdtemp(prefix="privateapply_build_")
    try:
        build_path = Path(build_dir)
        tex_file = build_path / "document.tex"

        # Write primary LaTeX source
        with open(tex_file, "w", encoding="utf-8") as f:
            f.write(source)

        # Write assets if provided
        if assets:
            for filename, b64_content in assets.items():
                if not validate_safe_filename(filename):
                    return {
                        "success": False,
                        "error_type": "SECURITY_VIOLATION",
                        "message": f"Invalid or unsafe asset filename: '{filename}'",
                        "duration_ms": int((time.time() - start_time) * 1000),
                    }
                target_file = build_path / filename
                try:
                    data = base64.b64decode(b64_content)
                    with open(target_file, "wb") as f:
                        f.write(data)
                except Exception as e:
                    return {
                        "success": False,
                        "error_type": "ASSET_WRITE_ERROR",
                        "message": f"Failed to write asset '{filename}': {e}",
                        "duration_ms": int((time.time() - start_time) * 1000),
                    }

        # 4. Construct command line with strict security parameters (NO shell=True)
        # Never allow shell escapes
        if selected_engine == "latexmk":
            cmd = [
                "latexmk",
                "-pdf",
                "-interaction=nonstopmode",
                "-halt-on-error",
                "-file-line-error",
                "-no-shell-escape",
                "document.tex"
            ]
        elif selected_engine == "pdflatex":
            cmd = [
                "pdflatex",
                "-interaction=nonstopmode",
                "-halt-on-error",
                "-file-line-error",
                "-no-shell-escape",
                "document.tex"
            ]
        elif selected_engine == "xelatex":
            cmd = [
                "xelatex",
                "-interaction=nonstopmode",
                "-halt-on-error",
                "-file-line-error",
                "-no-shell-escape",
                "document.tex"
            ]
        elif selected_engine == "lualatex":
            cmd = [
                "lualatex",
                "-interaction=nonstopmode",
                "-halt-on-error",
                "-file-line-error",
                "--no-shell-escape",
                "document.tex"
            ]
        else:
            cmd = [selected_engine, "-interaction=nonstopmode", "-halt-on-error", "-no-shell-escape", "document.tex"]

        log_debug(f"Executing: {' '.join(cmd)} in {build_dir} (timeout={timeout_secs}s)")

        # Run process safely
        process = subprocess.Popen(
            cmd,
            cwd=build_dir,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )

        try:
            stdout_data, stderr_data = process.communicate(timeout=timeout_secs)
            exit_code = process.returncode
        except subprocess.TimeoutExpired:
            process.kill()
            stdout_data, stderr_data = process.communicate()
            return {
                "success": False,
                "error_type": "TIMEOUT",
                "message": f"Compilation timed out after {timeout_secs} seconds.",
                "duration_ms": int((time.time() - start_time) * 1000),
                "engine_used": selected_engine,
            }

        duration_ms = int((time.time() - start_time) * 1000)

        # Read log file if generated
        log_file = build_path / "document.log"
        log_content = ""
        if log_file.exists():
            try:
                with open(log_file, "r", encoding="utf-8", errors="replace") as f:
                    log_content = f.read()
            except Exception:
                pass

        pdf_file = build_path / "document.pdf"
        success = (exit_code == 0) and pdf_file.exists()

        diagnostics = parse_compiler_diagnostics(log_content, stdout_data or "", stderr_data or "")

        result: Dict[str, Any] = {
            "success": success,
            "exit_code": exit_code,
            "duration_ms": duration_ms,
            "engine_used": selected_engine,
            "diagnostics": diagnostics,
        }

        if success:
            pdf_bytes = pdf_file.read_bytes()
            pdf_size = len(pdf_bytes)
            result["pdf_size"] = pdf_size
            if pdf_size <= MAX_PDF_RETURN_SIZE:
                result["pdf_base64"] = base64.b64encode(pdf_bytes).decode("ascii")
            else:
                # Save into cache artifact directory for user access
                artifact_dir = Path.home() / ".cache" / "privateapply" / "artifacts"
                artifact_dir.mkdir(parents=True, exist_ok=True)
                artifact_name = f"compiled_{int(time.time())}.pdf"
                dest_path = artifact_dir / artifact_name
                shutil.copy2(pdf_file, dest_path)
                result["artifact_path"] = str(dest_path)
                result["artifact_name"] = artifact_name
        else:
            result["error_type"] = "COMPILATION_ERROR"
            result["message"] = (
                diagnostics["errors"][0]["message"]
                if diagnostics["errors"]
                else f"Compiler exited with code {exit_code}"
            )

        return result

    finally:
        # Secure cleanup of build artifacts
        try:
            shutil.rmtree(build_dir, ignore_errors=True)
        except Exception:
            pass

# ── Message Dispatcher ────────────────────────────────────────────────────────

def handle_request(req: Dict[str, Any]) -> Dict[str, Any]:
    cmd = req.get("cmd") or req.get("command") or req.get("action")
    req_id = req.get("id")

    res: Dict[str, Any] = {
        "ok": True,
        "protocol_version": PROTOCOL_VERSION,
        "id": req_id,
    }

    if cmd == "ping":
        res["version"] = VERSION
        res["pong"] = True
        return res

    elif cmd == "get_status":
        engines = detect_installed_engines()
        has_any = any(e["available"] for e in engines.values())
        res["version"] = VERSION
        res["platform"] = "linux"
        res["tex_installed"] = has_any
        res["engines"] = engines
        return res

    elif cmd == "list_engines":
        res["engines"] = detect_installed_engines()
        return res

    elif cmd == "compile_latex":
        source = req.get("source", "")
        if not source:
            res["ok"] = False
            res["error"] = "No LaTeX source provided"
            return res

        engine = req.get("engine", "auto")
        assets = req.get("assets", {})
        timeout_secs = req.get("timeout_secs", DEFAULT_TIMEOUT_SECS)

        compile_result = run_latex_compilation(
            source=source,
            engine=engine,
            assets=assets,
            timeout_secs=timeout_secs
        )

        res.update(compile_result)
        res["ok"] = compile_result.get("success", False)
        return res

    else:
        res["ok"] = False
        res["error"] = f"Unknown command: '{cmd}'"
        return res

def main():
    log_debug(f"PrivateApply Companion daemon started (PID {os.getpid()})")
    try:
        while True:
            req = read_message()
            if req is None:
                log_debug("Clean shutdown: stdin closed by browser host.")
                break
            try:
                resp = handle_request(req)
            except Exception as e:
                log_debug(f"Exception handling command: {e}")
                resp = {
                    "ok": False,
                    "error": str(e),
                    "id": req.get("id"),
                    "protocol_version": PROTOCOL_VERSION,
                }
            send_message(resp)
    except Exception as e:
        log_debug(f"Fatal error in main loop: {e}")
    finally:
        log_debug("Companion exiting.")

if __name__ == "__main__":
    main()
