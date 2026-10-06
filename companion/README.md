# PrivateApply — AI LaTeX Résumé Editor and Linux Compilation Companion

## 1. Architecture Overview

PrivateApply hard-forks the privacy-first job application tool into a dedicated LaTeX résumé editor that preserves professional typographic design while tailoring content to specific job descriptions without fabricating qualifications.

```
┌────────────────────────────────────────────────────────┐
│             PrivateApply Browser Extension             │
│   (Chrome MV3 / Firefox MV2 — React & TypeScript)      │
│                                                        │
│  - LaTeX Source Input (Paste / Upload .tex)            │
│  - Document AST & Section Scanner (Balanced Braces)    │
│  - AI Provider Selector (Local Ollama / Groq / etc.)   │
│  - Exact-Anchor Structured Patch Engine                │
│  - Compile-and-Repair Iterative Loop                   │
│  - Interactive PDF Preview, Diff Viewer, & Rollback    │
└───────────────────────────┬────────────────────────────┘
                            │ Chrome / Mozilla Native Messaging
                            │ (4-byte length-prefixed JSON stdio)
                            ▼
┌────────────────────────────────────────────────────────┐
│          PrivateApply Linux Companion Host             │
│   (companion/privateapply_companion.py — Python 3)     │
│                                                        │
│  - Zero pip dependencies (Standard Library only)       │
│  - Path Traversal & Filename Sanitizer                 │
│  - Subprocess Execution (shell=False, -no-shell-escape)│
│  - Ephemeral Build Directory Isolation (mkdtemp)       │
│  - Structured Diagnostics Parser (file:line errors)    │
│  - Resource Limits (2MB source, 10MB assets, 30s limit)│
└───────────────────────────┬────────────────────────────┘
                            │ Safe Subprocess Execution
                            ▼
┌────────────────────────────────────────────────────────┐
│             Local TeX Distribution Toolchain           │
│   (latexmk, pdflatex, xelatex, or lualatex)            │
│                                                        │
│  - Multi-pass compilation                              │
│  - User's existing system fonts & macro packages       │
│  - Outputs compiled document.pdf & document.log        │
└────────────────────────────────────────────────────────┘
```

---

## 2. LaTeX Patch Engine & Editing Strategy

### 2.1 Section Identification
Rather than relying on fragile single-line regexes, the parser (`src/shared/latex-patch/latex-parser.ts`):
1. **Comment Filtering**: Tracks line-by-line comment states (`%` unescaped) to avoid detecting misleading section names inside comments.
2. **Balanced Braces**: Uses balanced curly brace parsing to extract macro arguments and nested commands without truncating complex formatting (e.g. `\section{\textbf{Professional Experience}}`).
3. **Environment Tracking**: Scans `\begin{...}` and `\end{...}` pairs to verify structural integrity and detect resume environment blocks like `\begin{rSection}{Experience}`.
4. **Dependency Detection**: Extracts `\usepackage`, `\input`, `\include`, and `\includegraphics` dependencies to flag any unsupplied asset files.

### 2.2 Structured Patch Protocol (Version 1)
Proposed modifications are returned as structured JSON patches:
```json
{
  "version": 1,
  "source_hash": "a1b2c3d4e5f60718",
  "operations": [
    {
      "type": "replace",
      "target_section": "Experience",
      "anchor": "\\item Developed scalable microservices using TypeScript and Node.js.",
      "content": "\\item Engineered high-throughput distributed microservices in TypeScript, processing 50K req/s.",
      "reason": "Align with backend performance requirement"
    }
  ]
}
```

### 2.3 Patch Validation Rules
Before any edit is applied to a copy of the document:
- **Schema & Version**: Rejects malformed JSON or unsupported protocol versions.
- **Source Hash**: Rejects stale patches if the document source changed after patch generation.
- **Exact-Anchor Verification**: The anchor must exist as an exact substring.
- **Unambiguous Anchor Check**: If an anchor matches more than once in the document/section, it is rejected with `ANCHOR_AMBIGUOUS`.
- **Overlap Protection**: Overlapping spans between operations are detected and rejected.
- **Syntax Check Post-Application**: Braces and LaTeX environments must remain balanced in the modified document, or changes are rolled back automatically.

### 2.4 Factual Integrity (Non-Fabrication Guarantee)
Prompt instructions strictly constrain the AI:
- The candidate's original résumé is the sole factual source of truth.
- Employment dates, company names, job titles, certifications, and educational degrees must never be altered or invented.
- Numerical performance metrics (e.g. revenue, percentages, team sizes) cannot be hallucinated.
- If a target qualification is not supported by the candidate's actual history, it is omitted or surfaced in the Keyword Gap view rather than fabricated.

---

## 3. Linux Companion Installation & Registration

The companion requires **Python 3.8+** and uses zero external pip dependencies.

### 3.1 Installation Command
From the repository root:
```bash
./companion/install.sh
```

This script:
1. Verifies Python 3 and detects installed TeX engines (`latexmk`, `pdflatex`, `xelatex`, `lualatex`).
2. Copies the executable to `~/.local/lib/privateapply/privateapply_companion.py` with `chmod +x`.
3. Registers Native Messaging manifests at:
   - Chrome: `~/.config/google-chrome/NativeMessagingHosts/com.privateapply.companion.json`
   - Chromium: `~/.config/chromium/NativeMessagingHosts/com.privateapply.companion.json`
   - Brave: `~/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts/com.privateapply.companion.json`
   - Firefox: `~/.mozilla/native-messaging-hosts/com.privateapply.companion.json`
4. Runs an automated stdio self-test to confirm communication.

### 3.2 Uninstallation Command
To cleanly remove manifests and companion files:
```bash
./companion/uninstall.sh
```

---

## 4. TeX Toolchain Requirements

PrivateApply does **not** bundle a multi-gigabyte TeX distribution. It invokes the user's existing system toolchain.

### Recommended System Packages
- **Fedora / RHEL**:
  ```bash
  sudo dnf install texlive-scheme-basic latexmk texlive-collection-latexrecommended
  ```
- **Ubuntu / Debian**:
  ```bash
  sudo apt install texlive-latex-base texlive-latex-recommended latexmk
  ```
- **Arch Linux**:
  ```bash
  sudo pacman -S texlive-basic texlive-bin
  ```

---

## 5. Security Architecture & Execution Constraints

The companion treats AI-generated LaTeX as untrusted input:
1. **Argument Arrays (No Shell Injection)**: Commands are invoked strictly via `subprocess.Popen(cmd_list, ...)` with `shell=False`. Shell commands returned by models are never executed.
2. **Execution Flags**:
   - `-no-shell-escape` (or `--no-shell-escape` for LuaLaTeX): Prevents LaTeX documents from spawning arbitrary shell processes via `\write18`.
   - `-interaction=nonstopmode`: Prevents the engine from hanging waiting for interactive terminal input.
   - `-halt-on-error`: Aborts immediately upon encountering a fatal syntax error.
   - `-file-line-error`: Produces parseable `file:line: error` diagnostics.
3. **Filesystem Isolation**:
   - Each build runs in an ephemeral directory generated by `tempfile.mkdtemp(prefix="privateapply_build_")`.
   - Build directories are securely cleaned up via `shutil.rmtree` after compilation.
4. **Path Traversal & Filename Sanitization**:
   - Asset filenames must match `^[a-zA-Z0-9_\-\.]+$`.
   - Rejects `..`, absolute paths, directory separators (`/`, `\`), null bytes, and symlinks.
5. **Resource Limits**:
   - Max `.tex` source size: **2 MB**.
   - Max asset size: **10 MB** (up to 30 files).
   - Max compilation time: **30 seconds** default (hard limit 120s). Timed-out processes and descendants are terminated with `SIGKILL`.

---

## 6. Compile-and-Repair Iterative Workflow

When tailoring a résumé:
1. **Initial Compilation**: The patched document is sent to the companion.
2. **Failure Analysis**: If compilation fails, the diagnostics parser extracts:
   - Error messages (e.g. `Undefined control sequence \foo`).
   - Line numbers from log output.
   - Missing LaTeX package names (e.g. `! LaTeX Error: File 'awesome-cv.cls' not found`).
3. **Missing Package Handling**: If a required package or custom class file is missing, PrivateApply surfaces the missing package name clearly so the user can supply it or install it, rather than attempting useless source rewrites.
4. **AI Error Repair**: For syntax or macro errors, PrivateApply extracts a 10-line snippet around the error line and requests a minimal corrective patch from the AI.
5. **Bounded Retries**: Maximum of 2 repair attempts. If compilation still fails, PrivateApply preserves the original source and displays the compiler diagnostics drawer.

---

## 7. Running the Automated Tests

### 7.1 Extension Unit & Integration Tests (Vitest)
```bash
# Chrome extension tests (343 tests)
cd apps/extension-chrome
npm test

# Firefox extension tests (343 tests)
cd ../extension-firefox
npm test
```

### 7.2 Native Companion Tests (Python unittest)
```bash
python3 companion/test_companion.py
```
Tests:
- 4-byte length-prefixed stdio framing roundtrip.
- Filename security & traversal rejection.
- Resource limits (source size limits).
- Error diagnosis & missing package extraction.
- End-to-end TeX compilation of valid documents to `%PDF-` byte streams.
- Syntax error handling.
