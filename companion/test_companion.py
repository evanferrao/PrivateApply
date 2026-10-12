#!/usr/bin/env python3
"""
Automated tests for PrivateApply Linux Compilation Companion
Tests message framing, command handling, security checks, and LaTeX compilation.
"""

import unittest
import sys
import os
import io
import struct
import json
import base64
from pathlib import Path

# Add companion directory to sys.path
sys.path.insert(0, str(Path(__file__).parent))

import privateapply_companion as companion

class TestCompanionFraming(unittest.TestCase):
    def test_message_framing_roundtrip(self):
        msg = {"cmd": "ping", "test": 123}
        encoded = json.dumps(msg).encode("utf-8")
        frame = struct.pack("=I", len(encoded)) + encoded

        # Simulate stdin read
        original_stdin = sys.stdin
        try:
            sys.stdin = io.TextIOWrapper(io.BytesIO(frame))
            read_back = companion.read_message()
            self.assertEqual(read_back, msg)
        finally:
            sys.stdin = original_stdin

class TestCompanionSecurity(unittest.TestCase):
    def test_safe_filenames(self):
        self.assertTrue(companion.validate_safe_filename("photo.png"))
        self.assertTrue(companion.validate_safe_filename("custom_style.sty"))
        self.assertTrue(companion.validate_safe_filename("my-class.cls"))
        self.assertTrue(companion.validate_safe_filename("font.ttf"))

        # Insecure or invalid filenames must be rejected
        self.assertFalse(companion.validate_safe_filename("../escape.txt"))
        self.assertFalse(companion.validate_safe_filename("/etc/passwd"))
        self.assertFalse(companion.validate_safe_filename("sub/dir/file.png"))
        self.assertFalse(companion.validate_safe_filename(".."))
        self.assertFalse(companion.validate_safe_filename("."))
        self.assertFalse(companion.validate_safe_filename("file\0null.png"))
        self.assertFalse(companion.validate_safe_filename("file;rm -rf /"))

    def test_max_source_size_enforced(self):
        giant_source = "A" * (companion.MAX_SOURCE_SIZE + 100)
        res = companion.run_latex_compilation(giant_source)
        self.assertFalse(res["success"])
        self.assertEqual(res["error_type"], "RESOURCE_LIMIT")

    def test_malicious_asset_path_rejected(self):
        res = companion.run_latex_compilation(
            source="\\documentclass{article}\\begin{document}Hi\\end{document}",
            assets={"../../evil.sh": base64.b64encode(b"echo evil").decode("ascii")}
        )
        self.assertFalse(res["success"])
        self.assertEqual(res["error_type"], "SECURITY_VIOLATION")

class TestCompanionDiagnostics(unittest.TestCase):
    def test_missing_package_detection(self):
        sample_log = """
This is pdfTeX, Version 3.141592653-2.6-1.40.24 (TeX Live 2022)
! LaTeX Error: File `awesome-cv.cls' not found.

Type X to quit or <RETURN> to proceed.
l.3 \\documentclass{awesome-cv}
"""
        diag = companion.parse_compiler_diagnostics(sample_log, "", "")
        self.assertIn("awesome-cv.cls", diag["missing_packages"])
        self.assertTrue(len(diag["errors"]) > 0)
        self.assertEqual(diag["errors"][0]["line"], 3)

    def test_syntax_error_detection(self):
        sample_log = """
! Undefined control sequence.
l.15 \\nonExistentMacro
                      {test}
"""
        diag = companion.parse_compiler_diagnostics(sample_log, "", "")
        self.assertTrue(len(diag["errors"]) > 0)
        self.assertEqual(diag["errors"][0]["message"], "Undefined control sequence.")
        self.assertEqual(diag["errors"][0]["line"], 15)

class TestCompanionCompilation(unittest.TestCase):
    def test_get_status_command(self):
        res = companion.handle_request({"cmd": "get_status"})
        self.assertTrue(res["ok"])
        self.assertEqual(res["version"], companion.VERSION)
        expected_platform = "windows" if sys.platform == "win32" else ("darwin" if sys.platform == "darwin" else "linux")
        self.assertEqual(res["platform"], expected_platform)
        self.assertIn("engines", res)

    def test_companion_base_dir(self):
        base_dir = companion.get_companion_base_dir()
        self.assertIsNotNone(base_dir)
        self.assertTrue(len(str(base_dir)) > 0)

    def test_compile_minimal_document(self):
        engines = companion.detect_installed_engines()
        available_engines = [e for e, v in engines.items() if v["available"]]
        if not available_engines:
            self.skipTest("No TeX engines available on this system to test real compilation.")

        sample_doc = (
            "\\documentclass{article}\n"
            "\\begin{document}\n"
            "\\textbf{Test Candidate}\\\\\n"
            "Software Engineer\\\\\\\\\n"
            "\\begin{itemize}\n"
            "  \\item Tested compilation with PrivateApply companion.\n"
            "\\end{itemize}\n"
            "\\end{document}\n"
        )

        res = companion.run_latex_compilation(sample_doc, engine="auto")
        self.assertTrue(res["success"], f"Compilation failed: {res}")
        self.assertIn("pdf_base64", res)
        self.assertGreater(res["pdf_size"], 0)

        # Verify PDF magic bytes (%PDF-)
        pdf_bytes = base64.b64decode(res["pdf_base64"])
        self.assertTrue(pdf_bytes.startswith(b"%PDF-"))

    def test_compile_syntax_error_fails_gracefully(self):
        engines = companion.detect_installed_engines()
        available_engines = [e for e, v in engines.items() if v["available"]]
        if not available_engines:
            self.skipTest("No TeX engines available on this system.")

        bad_doc = (
            "\\documentclass{article}\n"
            "\\begin{document}\n"
            "\\undefinedMacroCrashHere\n"
            "\\end{document}\n"
        )

        res = companion.run_latex_compilation(bad_doc)
        self.assertFalse(res["success"])
        self.assertEqual(res["error_type"], "COMPILATION_ERROR")
        self.assertTrue(len(res["diagnostics"]["errors"]) > 0)

if __name__ == "__main__":
    unittest.main()
