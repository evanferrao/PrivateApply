<div align="center">
  <img src="apps/extension-chrome/public/icons/logo-full-400w.png" alt="Private Apply" width="320" />
  <h3>Privacy-first job application assistant for Chrome & Firefox</h3>
  <p>Auto-fill forms · AI cover letters · Local Ollama · Zero cloud · Zero tracking</p>

  <p>
    <a href="https://github.com/joelnishanth/private-apply/blob/main/LICENSE">
      <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT License" />
    </a>
    <img src="https://img.shields.io/badge/version-0.2.4-22c55e.svg" alt="Version 0.2.4" />
    <img src="https://img.shields.io/badge/browser-Chrome-4285F4?logo=googlechrome&logoColor=white" alt="Chrome" />
    <img src="https://img.shields.io/badge/browser-Firefox_109%2B-FF7139?logo=firefox-browser&logoColor=white" alt="Firefox 109+" />
    <img src="https://img.shields.io/badge/AI-Ollama-black?logo=ollama&logoColor=white" alt="Ollama" />
    <img src="https://img.shields.io/badge/data_uploaded-0-22c55e.svg" alt="Zero data uploaded" />
  </p>

  <p>
    <a href="https://chromewebstore.google.com/detail/private-apply-job-applicat/bjllpojjllhfghiemokcoknfmhpmfbph"><strong>Get for Chrome</strong></a> ·
    <a href="https://addons.mozilla.org/en-US/firefox/addon/private-apply/"><strong>Get for Firefox</strong></a> ·
    <a href="https://joelnishanth.github.io/private-apply"><strong>Website</strong></a> ·
    <a href="#getting-started"><strong>Quick Start</strong></a> ·
    <a href="CONTRIBUTING.md"><strong>Contributing</strong></a> ·
    <a href="https://github.com/joelnishanth/private-apply/issues/new/choose"><strong>Report a Bug</strong></a>
  </p>

  <br/>

  <img src="assets/ss4.png" alt="Private Apply — Extension Home & Dashboard" width="800" style="border-radius:12px" />

</div>

---

## What It Does

PrivateApply detects job application forms on sites like Workday, Greenhouse, Lever, and plain HTML forms, then fills them out automatically using your stored profile. It also features a dedicated, privacy-first **AI LaTeX Résumé Editor** with a Linux Native Messaging compilation companion that preserves professional résumé formatting while compiling PDFs locally using your installed TeX distribution. Everything runs locally via [Ollama](https://ollama.com) or optional user-configured providers — with zero data sent to external servers unless explicitly configured.

| Feature | Description |
|---|---|
| **AI LaTeX Résumé Editor** | Tailor your existing `.tex` source to job descriptions without breaking formatting or macros |
| **Linux TeX Companion** | Compiles tailored LaTeX directly into high-fidelity PDFs via Chrome Native Messaging |
| **Compile-and-Repair Loop** | Automatically catches TeX diagnostics and requests bounded corrective patches from AI |
| **Smart Auto-Fill** | Detects all form fields and fills them from your profile in seconds |
| **AI Cover Letters** | Generates tailored cover letters using a local Ollama model |
| **Application Tracker** | Kanban dashboard to track every application from submitted to offer |
| **100% Private** | All data in `browser.storage.local` — no backend, no sync, no cloud tracking |
| **ATS Detection** | Identifies Workday, Greenhouse, Lever, and 50+ other ATS systems |
| **Learns From You** | Reinforcement learning improves autofill accuracy from your corrections |

See [LaTeX Editor & Companion Documentation](docs/latex-editor-and-companion.md) for architecture, installation, and security specifications.

---

## Screenshots

<div align="center">
  <table>
    <tr>
      <td align="center" width="33%">
        <img src="assets/ss1.png" alt="Extension Popup" width="240" /><br/>
        <sub><b>Extension Popup</b><br/>One-click auto-fill & cover letter</sub>
      </td>
      <td align="center" width="33%">
        <img src="assets/ss2.png" alt="Compatibility Score" width="240" /><br/>
        <sub><b>Compatibility Score</b><br/>AI-powered skills & salary match</sub>
      </td>
      <td align="center" width="33%">
        <img src="assets/ss3.png" alt="Profile Onboarding" width="240" /><br/>
        <sub><b>Profile Onboarding</b><br/>8-step guided setup from your resume</sub>
      </td>
    </tr>
  </table>
</div>

---

## Requirements

- **Chrome** or **Firefox** 109+
- **Node.js** 18+
- **[Ollama](https://ollama.com)** running locally with a model pulled (e.g. `llama3.2`)

---

## Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/joelnishanth/private-apply.git
cd private-apply
```

### 2. Install dependencies

```bash
npm install
```

### 3. Start Ollama

```bash
ollama serve
ollama pull llama3.2
```

### 4. Build the extensions

```bash
# Build both Chrome & Firefox extensions
npm run build

# Or build individually:
npm run build:chrome     # Outputs to .output/chrome
npm run build:firefox    # Outputs to .output/firefox

# Watch mode during development:
npm run dev:chrome
npm run dev:firefox
```

### 5. Load in Browser

- **Chrome / Chromium / Edge / Brave**:
  1. Open `chrome://extensions/`
  2. Enable "Developer mode" (top right toggle)
  3. Click "Load unpacked" and select `.output/chrome` (or `apps/extension-chrome/dist`).

- **Firefox**:
  1. Open `about:debugging` → "This Firefox"
  2. Click "Load Temporary Add-on"
  3. Select `.output/firefox/manifest.json` (or `apps/extension-firefox/dist/manifest.json`).

---

## Project Structure

The project uses a unified single-source-of-truth architecture that eliminates code duplication between Chrome and Firefox while producing independent, native extension builds:

```
private-apply/
├── src/                          # Shared TypeScript & React source code (Single Source of Truth)
│   ├── background.ts             # Background service / worker
│   ├── content.ts                # Primary DOM autofill & observer
│   ├── content-whatsapp.ts       # WhatsApp status sync content script
│   ├── popup/                    # Extension popup UI logic
│   ├── onboarding/               # First-run resume parser & profile setup
│   ├── dashboard/                # Application analytics dashboard
│   ├── profiles/                 # Candidate Profile Hub & multi-profile manager
│   ├── settings/                 # Providers, country-packs, gist sync settings
│   ├── jobs/                     # Job tracker & discovery
│   ├── resume-tailor/            # Resume & LaTeX tailoring engine
│   ├── tutorial/                 # Extension interactive tour
│   ├── data/                     # React Graph Memory Explorer
│   └── shared/                   # Autofill matching, packs, graph memory, gist sync
├── public/                       # Shared HTML pages, CSS stylesheets, icons, and static assets
├── browser/                      # Browser-specific configurations
│   ├── chrome/                   # Chrome Manifest V3 configuration
│   └── firefox/                  # Firefox Manifest V2 configuration & native messaging host
├── scripts/
│   ├── build.mjs                 # Unified multi-browser esbuild compilation script
│   └── package.mjs               # Release zip packaging script
├── .output/                      # Output build artifacts (git-ignored)
│   ├── chrome/                   # Unpacked Chrome extension
│   └── firefox/                  # Unpacked Firefox extension
├── apps/                         # Legacy paths with build delegates for backward compatibility
│   ├── extension-chrome/
│   └── extension-firefox/
├── assets/                       # Brand assets, logos, and screenshots
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── SECURITY.md
├── LICENSE
└── index.html                    # GitHub Pages landing page
```

---

## Development

| Command | Description |
|---|---|
| `npm run build` | Production build to `dist/` |
| `npm run dev` | Watch mode — rebuilds on file changes |
| `npm run run:firefox` | Build + launch Firefox with extension loaded |
| `npm test` | Run unit tests (Vitest) |
| `npm run test:watch` | Tests in watch mode |

---

## Privacy Architecture

All data stays on your machine. The extension only makes network requests to `localhost` (Ollama).

```
Your Browser (local storage)
    ├── Profile data (resume, personal info)
    ├── Application history
    └── Learned corrections

localhost:11434 (Ollama)
    └── Cover letter generation
        └── Model runs entirely on your hardware

No external servers. No analytics. No telemetry.
```

---

## Contributing

Contributions are welcome — bug fixes, new ATS integrations, better form detection, UI improvements. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

**Good first issues:** look for the [`good first issue`](https://github.com/joelnishanth/private-apply/labels/good%20first%20issue) label.

---

## Security

If you discover a security vulnerability, please follow the responsible disclosure process in [SECURITY.md](SECURITY.md) rather than opening a public issue.

---

## License

[MIT](LICENSE) — © 2026 [Private Apply](https://github.com/joelnishanth/private-apply)
