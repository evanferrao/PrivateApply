# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Tech and engineering job seekers applying to roles across diverse Applicant Tracking Systems (ATS) who have structured profiles and technical resumes (including LaTeX sources), and who require strict privacy and zero cloud telemetry for their personal career data.

## Product Purpose

Private Apply eliminates repetitive job application workflows by automatically detecting form fields, analyzing job compatibility, generating tailored cover letters, and patching LaTeX resumes—all while running local AI inference. Success means enabling candidates to submit accurate, high-fidelity applications rapidly while guaranteeing zero personal data leakage.

## Positioning

A truly privacy-first, zero-cloud job application assistant. Unlike conventional application automation extensions that send resumes and personal history to third-party servers, Private Apply executes all AI generation locally via Ollama (or user-managed endpoints), stores all profile and history data exclusively in local browser storage (`browser.storage.local`), and uniquely integrates with a native desktop TeX companion for offline high-fidelity resume compilation.

## Operating Context

- **Extension Platforms:** Chrome (Manifest V3) and Firefox (109+) extension runtime interfaces (popup, side panel, options/dashboard, profiles manager, in-page suggestion modals).
- **ATS Environments:** Third-party job portals including Workday, Greenhouse, Lever, Ashby, BambooHR, and standard HTML web forms.
- **Native Desktop Companion:** Linux native messaging host communicating with local TeX distributions (`pdflatex`, `xelatex`, `lualatex`) to compile and render PDFs directly from browser edits.
- **Local AI Daemon:** Local Ollama runtime (e.g. `llama3.2`, `deepseek-r1`) accessed over localhost HTTP, alongside optional configurable multi-provider AI backends.
- **User Workflows:** Resume importing and profile onboarding, job page inspection and compatibility scoring, one-click form filling with manual override modals, interactive cover letter generation, and bounded LaTeX resume tailoring.

## Capabilities and Constraints

- **Local Persistence Only:** All candidate data, application statuses, notes, and profile variants reside strictly in `browser.storage.local`.
- **Zero Telemetry:** No third-party trackers, analytics scripts, or unprompted network calls.
- **Smart ATS Detection & Autofill:** Rule-based and learning-assisted field recognition across 50+ ATS platforms.
- **AI LaTeX Editor & Native Companion:** Syntax-preserving tailoring of `.tex` resumes with diagnostic log capture and iterative compile-and-repair loops.
- **Application Tracker:** Integrated Kanban board tracking application pipeline stages from draft to offer.
- **Technical Constraint:** Browser extensions cannot directly spawn child OS processes; compilation relies strictly on the Chrome/Firefox Native Messaging API host.

## Brand Commitments

- **Name:** Private Apply.
- **Voice:** Direct, technical, transparent, and trustworthy; prioritizes utility and clarity over marketing hyperbole.
- **Identity Assets:** Official logomarks, typography references, and badges located in `Brandkit/`, `assets/`, and `apps/extension-chrome/public/icons/`.

## Evidence on Hand

- Chrome Extension implementation in `apps/extension-chrome/`.
- Firefox Extension implementation in `apps/extension-firefox/`.
- Native messaging compilation companion in `companion/`.
- Technical and security architecture in `docs/latex-editor-and-companion.md`.
- Sample test resumes in root: `Resume.tex` and `Resume.pdf`.
- Interface screenshots in `assets/ss1.png`, `assets/ss2.png`, `assets/ss3.png`, `assets/ss4.png`.

## Product Principles

1. **Privacy Absolute & Local First:** The default state never exposes user data to cloud services; all sensitive applicant intelligence stays on the user's machine.
2. **User in Control:** Automation accelerates tedious tasks, but the candidate retains final review, edit capability, and explicit approval before any form submission or resume compile.
3. **High-Fidelity Preservation:** Résumé tailoring preserves structural syntax, LaTeX macros, and professional typesetting standards without introducing destructive formatting errors.
4. **Transparent Feedback:** The system provides inspectable explanations for match scores, filled fields, diagnostic compilation errors, and local AI connection statuses.
