/**
 * PrivateApply — AI LaTeX Résumé Editor & Compilation Companion
 * UI controller for LaTeX parsing, patch editing, diff inspection,
 * TeX compilation, and PDF preview.
 */

import browser from '../shared/browser-compat';
import { getUserProfile } from '../shared/profile';
import {
  getAIProvidersSettings,
  getActiveAIProvider,
  setActiveAIProviderId,
  AIProviderConfig,
} from '../shared/ai-provider-config';
import { aiClient } from '../shared/ai-client';
import { companionClient, CompanionStatus } from '../shared/companion-client';
import { latexTailorService, LatexTailorResult } from '../shared/latex-tailor-service';
import { tailorResume, analyzeKeywordGap } from '../shared/resume-tailor-service';
import { DiffLine, SemanticChange } from '../shared/latex-patch/types';
import { escapeHtml } from '../shared/html';

// DOM Elements
const tabModeLatex = document.getElementById('tab-mode-latex') as HTMLButtonElement;
const tabModePlaintext = document.getElementById('tab-mode-plaintext') as HTMLButtonElement;

const aiStatusDot = document.getElementById('ai-status-dot') as HTMLElement;
const aiProviderSelect = document.getElementById('ai-provider-select') as HTMLSelectElement;
const remoteDisclosureTag = document.getElementById('remote-disclosure-tag') as HTMLElement;

const companionStatusDot = document.getElementById('companion-status-dot') as HTMLElement;
const companionStatusText = document.getElementById('companion-status-text') as HTMLElement;
const btnCompanionGuide = document.getElementById('btn-companion-guide') as HTMLButtonElement;
const companionGuideBox = document.getElementById('companion-guide-box') as HTMLElement;
const btnCloseGuide = document.getElementById('btn-close-guide') as HTMLButtonElement;

const texEngineSelect = document.getElementById('tex-engine-select') as HTMLSelectElement;
const engineSelectGroup = document.getElementById('engine-select-group') as HTMLElement;

const resumePanelTitle = document.getElementById('resume-panel-title') as HTMLElement;
const resumeEditor = document.getElementById('resume-editor') as HTMLTextAreaElement;
const jdEditor = document.getElementById('jd-editor') as HTMLTextAreaElement;

const texFileUpload = document.getElementById('tex-file-upload') as HTMLInputElement;
const btnUploadTex = document.getElementById('btn-upload-tex') as HTMLButtonElement;
const btnLoadSample = document.getElementById('btn-load-sample') as HTMLButtonElement;
const btnScrapeJd = document.getElementById('btn-scrape-jd') as HTMLButtonElement;

const btnTailorMain = document.getElementById('btn-tailor-main') as HTMLButtonElement;
const btnTailorLabel = document.getElementById('btn-tailor-label') as HTMLElement;
const btnCompileOnly = document.getElementById('btn-compile-only') as HTMLButtonElement;
const btnDownloadPdf = document.getElementById('btn-download-pdf') as HTMLButtonElement;
const btnDownloadTex = document.getElementById('btn-download-tex') as HTMLButtonElement;
const btnRollback = document.getElementById('btn-rollback') as HTMLButtonElement;
const liveStatusText = document.getElementById('live-status-text') as HTMLElement;

const inspectionContainer = document.getElementById('inspection-container') as HTMLElement;
const pdfPreviewIframe = document.getElementById('pdf-preview-iframe') as HTMLIFrameElement;
const pdfPreviewOriginalIframe = document.getElementById('pdf-preview-original-iframe') as HTMLIFrameElement | null;
const tailoredPdfPlaceholder = document.getElementById('tailored-pdf-placeholder') as HTMLElement | null;
const originalPdfStatus = document.getElementById('original-pdf-status') as HTMLElement | null;
const tailoredPdfStatus = document.getElementById('tailored-pdf-status') as HTMLElement | null;
const btnOpenOriginalTab = document.getElementById('btn-open-original-tab') as HTMLButtonElement | null;
const btnViewSideBySide = document.getElementById('btn-view-side-by-side') as HTMLButtonElement | null;
const btnViewTailoredOnly = document.getElementById('btn-view-tailored-only') as HTMLButtonElement | null;
const btnViewOriginalOnly = document.getElementById('btn-view-original-only') as HTMLButtonElement | null;
const pdfComparisonContainer = document.getElementById('pdf-comparison-container') as HTMLElement | null;

const diffTableBody = document.getElementById('diff-table-body') as HTMLElement;
const semanticChangesBox = document.getElementById('semantic-changes-box') as HTMLElement;
const tailoredSourceView = document.getElementById('tailored-source-view') as HTMLTextAreaElement;
const diagnosticsSummary = document.getElementById('diagnostics-summary') as HTMLElement;
const diagnosticsLogText = document.getElementById('diagnostics-log-text') as HTMLElement;
const keywordsPresentBox = document.getElementById('keywords-present-box') as HTMLElement;
const keywordsMissingBox = document.getElementById('keywords-missing-box') as HTMLElement;

// App State
type EditorMode = 'latex' | 'plaintext';
let currentMode: EditorMode = 'latex';
let originalTexSource: string = '';
let currentTailoredTex: string = '';
let originalPdfBase64: string = '';
let originalPdfBlobUrl: string = '';
let tailoredPdfBase64: string = '';
let tailoredPdfBlobUrl: string = '';
let currentPdfBase64: string = '';
let currentPdfBlobUrl: string = '';
let sourceTabId: number | null = null;

const DEFAULT_INJECTED_TEX = (typeof process !== 'undefined' && (process.env as any)?.DEFAULT_RESUME_TEX) || '';
const SAMPLE_LATEX = DEFAULT_INJECTED_TEX || `\\documentclass[letterpaper,11pt]{article}
\\usepackage{latexsym}
\\usepackage[empty]{fullpage}
\\usepackage{titlesec}
\\usepackage{marvosym}
\\usepackage[usenames,dvipsnames]{color}
\\usepackage{verbatim}
\\usepackage{enumitem}
\\usepackage[hidelinks]{hyperref}
\\usepackage{fancyhdr}

\\pagestyle{fancy}
\\fancyhf{}
\\renewcommand{\\headrulewidth}{0pt}
\\renewcommand{\\footrulewidth}{0pt}

\\addtolength{\\oddsidemargin}{-0.5in}
\\addtolength{\\evensidemargin}{-0.5in}
\\addtolength{\\textwidth}{1in}
\\addtolength{\\topmargin}{-.5in}
\\addtolength{\\textheight}{1.0in}

\\urlstyle{same}
\\raggedbottom
\\raggedright
\\setlength{\\tabcolsep}{0in}

\\titleformat{\\section}{
  \\vspace{-4pt}\\scshape\\raggedright\\large
}{}{0em}{}[\\color{black}\\titlerule \\vspace{-5pt}]

\\begin{document}

\\begin{center}
  \\textbf{\\Huge \\scshape Jane Doe} \\\\ \\vspace{1pt}
  \\small +1 (555) 019-2834 $|$ \\href{mailto:jane.doe@example.com}{\\underline{jane.doe@example.com}} $|$ 
  \\href{https://linkedin.com/in/janedoe}{\\underline{linkedin.com/in/janedoe}} $|$
  \\href{https://github.com/janedoe}{\\underline{github.com/janedoe}}
\\end{center}

\\section{Experience}
  \\begin{itemize}[leftmargin=0.15in, label={}]
    \\item
      \\textbf{Senior Full Stack Engineer} -- CloudScale Inc. \\hfill Jan 2022 -- Present
      \\begin{itemize}
        \\item Designed and deployed microservices handling 25M daily requests using TypeScript, Node.js, and Redis.
        \\item Spearheaded migration of legacy monolith to containerized Docker services orchestrated with Kubernetes.
        \\item Optimized PostgreSQL relational schema and indexing, cutting p99 query latency by 35\\%.
        \\item Collaborated closely with cross-functional product and design teams in weekly agile sprints.
      \\end{itemize}
    \\item
      \\textbf{Software Engineer} -- DataPulse Systems \\hfill Jul 2019 -- Dec 2021
      \\begin{itemize}
        \\item Developed full-stack features using React, TypeScript, and Python Flask with 99.9\\% SLA uptime.
        \\item Implemented end-to-end automated testing pipelines with Jest and Playwright, improving test coverage by 25\\%.
        \\item Mentored junior engineers and conducted peer code reviews adhering to high engineering standards.
      \\end{itemize}
  \\end{itemize}

\\section{Projects}
  \\begin{itemize}[leftmargin=0.15in, label={}]
    \\item
      \\textbf{Distributed Task Queue}: High-performance async queue system built with Go and Redis.
    \\item
      \\textbf{Telemetry Dashboard}: Real-time metrics visualization platform built using React and WebSockets.
  \\end{itemize}

\\section{Technical Skills}
  \\begin{itemize}[leftmargin=0.15in, label={}]
    \\item \\textbf{Languages}: TypeScript, JavaScript, Python, Go, SQL, HTML/CSS
    \\item \\textbf{Frameworks \\& Libraries}: React, Next.js, Node.js, Express, Tailwind CSS
    \\item \\textbf{Infrastructure \\& Tools}: Docker, Kubernetes, AWS (S3, ECS, RDS), Git, Linux, PostgreSQL, Redis
  \\end{itemize}

\\section{Education}
  \\begin{itemize}[leftmargin=0.15in, label={}]
    \\item
      \\textbf{University of California, Berkeley} \\hfill Aug 2015 -- May 2019\\\\
      Bachelor of Science in Computer Science
  \\end{itemize}

\\end{document}
`;

function setLiveStatus(msg: string): void {
  if (liveStatusText) liveStatusText.textContent = msg;
}



// ── Mode Switching ─────────────────────────────────────────────────────────────

function switchMode(mode: EditorMode): void {
  currentMode = mode;
  if (mode === 'latex') {
    tabModeLatex.classList.add('active');
    tabModePlaintext.classList.remove('active');
    resumePanelTitle.textContent = 'LaTeX Résumé Source (.tex)';
    btnUploadTex.style.display = 'inline-flex';
    btnLoadSample.style.display = 'inline-flex';
    btnCompileOnly.style.display = 'inline-flex';
    btnDownloadPdf.style.display = 'inline-flex';
    btnDownloadTex.style.display = 'inline-flex';
    engineSelectGroup.style.display = 'inline-flex';
    btnTailorLabel.textContent = 'Tailor & Compile LaTeX';
    resumeEditor.placeholder = 'Paste your \\documentclass LaTeX résumé source here, or click "Upload .tex"...';
    if (!resumeEditor.value.includes('\\documentclass') && originalTexSource) {
      resumeEditor.value = originalTexSource;
    }
  } else {
    tabModePlaintext.classList.add('active');
    tabModeLatex.classList.remove('active');
    resumePanelTitle.textContent = 'Plain Text / Markdown Résumé';
    btnUploadTex.style.display = 'none';
    btnLoadSample.style.display = 'none';
    btnCompileOnly.style.display = 'none';
    btnDownloadPdf.style.display = 'none';
    btnDownloadTex.style.display = 'none';
    engineSelectGroup.style.display = 'none';
    btnTailorLabel.textContent = 'Tailor Resume';
    resumeEditor.placeholder = 'Paste your plain text or Markdown résumé here...';
  }
}

// ── AI Provider Management ─────────────────────────────────────────────────────

async function loadAIProviders(): Promise<void> {
  try {
    const settings = await getAIProvidersSettings();
    const active = await getActiveAIProvider();

    aiProviderSelect.innerHTML = '';
    for (const prov of settings.providers) {
      if (!prov.enabled) continue;
      const opt = document.createElement('option');
      opt.value = prov.id;
      opt.textContent = `${prov.nickname} (${prov.chatModel})`;
      if (active && prov.id === active.id) {
        opt.selected = true;
      }
      aiProviderSelect.appendChild(opt);
    }

    updateProviderDisclosure(active);
  } catch (err) {
    console.warn('Failed to load AI providers:', err);
  }
}

function updateProviderDisclosure(provider: AIProviderConfig | null): void {
  if (!provider) {
    aiStatusDot.className = 'status-dot disconnected';
    remoteDisclosureTag.style.display = 'none';
    return;
  }

  aiStatusDot.className = 'status-dot connected';
  const isRemote = provider.protocol === 'openai' || !provider.baseUrl.includes('localhost') && !provider.baseUrl.includes('127.0.0.1');

  if (isRemote) {
    remoteDisclosureTag.style.display = 'inline-block';
    remoteDisclosureTag.title = `Notice: Tailoring queries will be sent to remote provider: ${provider.nickname} (${provider.baseUrl})`;
  } else {
    remoteDisclosureTag.style.display = 'none';
  }
}

aiProviderSelect?.addEventListener('change', async () => {
  const selectedId = aiProviderSelect.value;
  await setActiveAIProviderId(selectedId);
  const active = await getActiveAIProvider();
  updateProviderDisclosure(active);
  setLiveStatus(`Switched AI provider to ${active?.nickname || selectedId}`);
});

// ── Linux Companion Detection ──────────────────────────────────────────────────

async function checkCompanion(): Promise<void> {
  companionStatusDot.className = 'status-dot';
  companionStatusText.textContent = 'Checking native companion...';

  try {
    const status: CompanionStatus = await companionClient.getStatus();
    if (status.installed) {
      if (status.texInstalled) {
        companionStatusDot.className = 'status-dot connected';
        const engines = Object.keys(status.engines || {}).filter(k => status.engines?.[k]?.available);
        companionStatusText.textContent = `Ready (${engines.join(', ') || 'TeX detected'})`;
      } else {
        companionStatusDot.className = 'status-dot warning';
        companionStatusText.textContent = 'Connected (TeX engines missing on host)';
      }
    } else {
      companionStatusDot.className = 'status-dot disconnected';
      companionStatusText.textContent = 'Not installed (Compilation skipped)';
    }
  } catch {
    companionStatusDot.className = 'status-dot disconnected';
    companionStatusText.textContent = 'Not installed';
  }
}

btnCompanionGuide?.addEventListener('click', () => {
  companionGuideBox.classList.toggle('visible');
});

btnCloseGuide?.addEventListener('click', () => {
  companionGuideBox.classList.remove('visible');
});

// ── File Upload and Sample Loading ─────────────────────────────────────────────

btnUploadTex?.addEventListener('click', () => {
  texFileUpload.click();
});

texFileUpload?.addEventListener('change', () => {
  const file = texFileUpload.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const content = e.target?.result as string;
    if (content) {
      resumeEditor.value = content;
      originalTexSource = content;
      setLiveStatus(`Uploaded "${file.name}" (${(file.size / 1024).toFixed(1)} KB)`);
    }
  };
  reader.readAsText(file);
});

btnLoadSample?.addEventListener('click', () => {
  resumeEditor.value = SAMPLE_LATEX;
  originalTexSource = SAMPLE_LATEX;
  setLiveStatus('Loaded sample professional LaTeX résumé.');
});

// ── Inspection Tabs ────────────────────────────────────────────────────────────

function setupInspectTabs(): void {
  const tabs = document.querySelectorAll('.inspect-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const targetId = `content-${tab.getAttribute('data-tab')}`;
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      const targetContent = document.getElementById(targetId);
      if (targetContent) targetContent.classList.add('active');
    });
  });
}

function switchInspectTab(tabKey: 'tab-pdf' | 'tab-diff' | 'tab-source' | 'tab-diagnostics' | 'tab-keywords'): void {
  const tabBtn = document.querySelector(`.inspect-tab[data-tab="${tabKey}"]`) as HTMLButtonElement;
  if (tabBtn) tabBtn.click();
}

// ── Rendering Results ──────────────────────────────────────────────────────────

function renderDiff(diffLines: DiffLine[]): void {
  diffTableBody.innerHTML = '';
  diffLines.forEach(line => {
    const tr = document.createElement('tr');
    tr.className = line.type;

    const tdOld = document.createElement('td');
    tdOld.className = 'line-num';
    tdOld.textContent = line.oldLineNumber ? String(line.oldLineNumber) : '';

    const tdNew = document.createElement('td');
    tdNew.className = 'line-num';
    tdNew.textContent = line.newLineNumber ? String(line.newLineNumber) : '';

    const tdSign = document.createElement('td');
    tdSign.className = 'sign';
    tdSign.textContent = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ';

    const tdContent = document.createElement('td');
    tdContent.textContent = line.content;

    tr.appendChild(tdOld);
    tr.appendChild(tdNew);
    tr.appendChild(tdSign);
    tr.appendChild(tdContent);
    diffTableBody.appendChild(tr);
  });
}

function renderSemanticChanges(changes: SemanticChange[]): void {
  semanticChangesBox.innerHTML = '';
  if (!changes || changes.length === 0) {
    semanticChangesBox.innerHTML = '<p style="color:var(--gray-600);font-size:13px;">No bullet points modified.</p>';
    return;
  }

  changes.forEach(c => {
    const card = document.createElement('div');
    card.className = 'semantic-card';
    card.innerHTML = `
      <div class="semantic-card-header">
        <span class="badge-info">${escapeHtml(c.section || 'Section')}</span>
        <span style="font-weight:600;">${c.type.replace('_', ' ').toUpperCase()}</span>
      </div>
      ${c.reason ? `<div style="color:var(--accent);font-size:12px;margin-bottom:4px;font-weight:500;"><strong>Goal:</strong> ${escapeHtml(c.reason)}</div>` : ''}
      ${c.original ? `<div style="color:var(--red);font-size:12px;"><s>${escapeHtml(c.original)}</s></div>` : ''}
      ${c.updated ? `<div style="color:var(--accent);font-size:12px;margin-top:2px;"><strong>+</strong> ${escapeHtml(c.updated)}</div>` : ''}
    `;
    semanticChangesBox.appendChild(card);
  });
}

function renderDiagnostics(diagnostics?: any, exitCode?: number, durationMs?: number, engine?: string): void {
  diagnosticsSummary.innerHTML = '';
  if (!diagnostics) {
    diagnosticsLogText.textContent = 'No compilation diagnostics available.';
    return;
  }

  const headerHtml = `
    <div style="display:flex;gap:12px;margin-bottom:10px;font-size:13px;flex-wrap:wrap;">
      <span><strong>Engine:</strong> ${escapeHtml(engine || 'auto')}</span>
      <span><strong>Exit Code:</strong> ${exitCode ?? 0}</span>
      <span><strong>Duration:</strong> ${durationMs ? durationMs + 'ms' : 'N/A'}</span>
    </div>
  `;
  diagnosticsSummary.innerHTML = headerHtml;

  if (diagnostics.missingPackages && diagnostics.missingPackages.length > 0) {
    const pkgWarn = document.createElement('div');
    pkgWarn.className = 'diagnostic-error-item';
    pkgWarn.innerHTML = `<strong>Missing LaTeX Packages:</strong> ${diagnostics.missingPackages.join(', ')}<br/><small>Install these packages via your distribution package manager (e.g. texlive-scheme-full or dnf/apt).</small>`;
    diagnosticsSummary.appendChild(pkgWarn);
  }

  if (diagnostics.errors && diagnostics.errors.length > 0) {
    diagnostics.errors.forEach((err: any) => {
      const errEl = document.createElement('div');
      errEl.className = 'diagnostic-error-item';
      errEl.innerHTML = `<strong>Line ${err.line ?? '?'}:</strong> ${escapeHtml(err.message)} ${err.context ? `<br/><small><code>${escapeHtml(err.context)}</code></small>` : ''}`;
      diagnosticsSummary.appendChild(errEl);
    });
  }

  diagnosticsLogText.textContent = diagnostics.logExcerpt || 'Compiler ran cleanly with no output logs.';
}

const SAMPLE_JD = `Senior Software Engineer - Distributed Systems & AI
Company: Acme Tech Corp
Location: Remote / Hybrid

About the Role:
We are looking for a Senior Software Engineer with strong experience in distributed backend systems, Python, TypeScript/JavaScript, and AI integrations (LLM APIs, RAG pipelines).

Responsibilities:
- Architect and scale high-throughput backend services and microservices.
- Design resilient local AI workflows and native desktop integrations.
- Collaborate with product and design to deliver robust user-facing developer tooling.
- Mentor junior engineers and enforce code quality, unit testing, and CI/CD best practices.

Requirements:
- 5+ years building production backend and full-stack software.
- Proficiency in Python, TypeScript, modern web APIs, and containerized deployments.
- Hands-on experience with LLMs, prompt engineering, vector embeddings, and retrieval-augmented generation.
- Strong knowledge of Linux internals, process management, and IPC communication.
- Bachelor's or Master's in Computer Science or equivalent practical experience.`;

function updateOriginalPdfPreview(base64Data: string): void {
  originalPdfBase64 = base64Data;
  if (originalPdfBlobUrl) {
    URL.revokeObjectURL(originalPdfBlobUrl);
  }

  const sizeKb = ((base64Data.length * 0.75) / 1024).toFixed(1);
  if (originalPdfStatus) {
    originalPdfStatus.textContent = `Ready (${sizeKb} KB)`;
  }

  try {
    const byteChars = atob(base64Data);
    const byteArray = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
      byteArray[i] = byteChars.charCodeAt(i);
    }
    const blob = new Blob([byteArray], { type: 'application/pdf' });
    originalPdfBlobUrl = URL.createObjectURL(blob);
    if (pdfPreviewOriginalIframe) {
      pdfPreviewOriginalIframe.src = originalPdfBlobUrl;
    }
  } catch (err) {
    console.error('Failed to render original PDF preview blob:', err);
    if (pdfPreviewOriginalIframe) {
      pdfPreviewOriginalIframe.src = `data:application/pdf;base64,${base64Data}`;
    }
  }
}

function updateTailoredPdfPreview(base64Data: string): void {
  tailoredPdfBase64 = base64Data;
  currentPdfBase64 = base64Data;
  if (tailoredPdfBlobUrl) {
    URL.revokeObjectURL(tailoredPdfBlobUrl);
  }

  const sizeKb = ((base64Data.length * 0.75) / 1024).toFixed(1);
  if (tailoredPdfStatus) {
    tailoredPdfStatus.textContent = `Ready (${sizeKb} KB)`;
  }

  const pdfInfo = document.getElementById('pdf-preview-info');
  if (pdfInfo) {
    pdfInfo.textContent = `Side-by-side comparison active — Tailored PDF (${sizeKb} KB)`;
  }

  try {
    const byteChars = atob(base64Data);
    const byteArray = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
      byteArray[i] = byteChars.charCodeAt(i);
    }
    const blob = new Blob([byteArray], { type: 'application/pdf' });
    tailoredPdfBlobUrl = URL.createObjectURL(blob);
    currentPdfBlobUrl = tailoredPdfBlobUrl;

    if (tailoredPdfPlaceholder) {
      tailoredPdfPlaceholder.style.display = 'none';
    }
    if (pdfPreviewIframe) {
      pdfPreviewIframe.style.display = 'block';
      pdfPreviewIframe.src = tailoredPdfBlobUrl;
    }
    btnDownloadPdf.disabled = false;
  } catch (err) {
    console.error('Failed to render tailored PDF preview blob:', err);
    if (tailoredPdfPlaceholder) {
      tailoredPdfPlaceholder.style.display = 'none';
    }
    if (pdfPreviewIframe) {
      pdfPreviewIframe.style.display = 'block';
      pdfPreviewIframe.src = `data:application/pdf;base64,${base64Data}`;
    }
    btnDownloadPdf.disabled = false;
  }
}

function updatePdfPreview(base64Data: string): void {
  updateTailoredPdfPreview(base64Data);
}

// Wire side-by-side view mode buttons
btnViewSideBySide?.addEventListener('click', () => {
  pdfComparisonContainer?.classList.remove('view-original-only', 'view-tailored-only');
  btnViewSideBySide.classList.add('active');
  btnViewTailoredOnly?.classList.remove('active');
  btnViewOriginalOnly?.classList.remove('active');
});

btnViewTailoredOnly?.addEventListener('click', () => {
  pdfComparisonContainer?.classList.remove('view-original-only');
  pdfComparisonContainer?.classList.add('view-tailored-only');
  btnViewTailoredOnly.classList.add('active');
  btnViewSideBySide?.classList.remove('active');
  btnViewOriginalOnly?.classList.remove('active');
});

btnViewOriginalOnly?.addEventListener('click', () => {
  pdfComparisonContainer?.classList.remove('view-tailored-only');
  pdfComparisonContainer?.classList.add('view-original-only');
  btnViewOriginalOnly.classList.add('active');
  btnViewSideBySide?.classList.remove('active');
  btnViewTailoredOnly?.classList.remove('active');
});

btnOpenOriginalTab?.addEventListener('click', () => {
  if (originalPdfBlobUrl) {
    window.open(originalPdfBlobUrl, '_blank');
  }
});

// ── Actions ────────────────────────────────────────────────────────────────────

document.getElementById('btn-sample-jd')?.addEventListener('click', () => {
  jdEditor.value = SAMPLE_JD;
  setLiveStatus('Loaded sample target job description. Ready to tailor!');
});

document.getElementById('btn-open-pdf-tab')?.addEventListener('click', () => {
  if (currentPdfBlobUrl) {
    window.open(currentPdfBlobUrl, '_blank');
  } else if (currentPdfBase64) {
    const w = window.open();
    w?.document.write(`<iframe src="data:application/pdf;base64,${currentPdfBase64}" style="width:100%;height:100%;border:none;"></iframe>`);
  }
});

btnTailorMain?.addEventListener('click', async () => {
  const resumeText = resumeEditor.value.trim();
  const jdText = jdEditor.value.trim();

  if (!resumeText) {
    setLiveStatus('Please provide your résumé source. Click "Load Sample" to use a sample LaTeX template.');
    resumeEditor.focus();
    resumeEditor.classList.add('error-pulse');
    setTimeout(() => resumeEditor.classList.remove('error-pulse'), 1500);
    return;
  }
  if (!jdText) {
    setLiveStatus('Please provide a target job description. Click "Load Sample JD" to test immediately.');
    jdEditor.focus();
    jdEditor.classList.add('error-pulse');
    setTimeout(() => jdEditor.classList.remove('error-pulse'), 1500);
    return;
  }

  btnTailorMain.disabled = true;
  btnCompileOnly.disabled = true;
  setLiveStatus('Starting AI tailoring...');
  inspectionContainer.classList.add('visible');

  if (currentMode === 'latex') {
    if (!originalTexSource) {
      originalTexSource = resumeText;
    }

    try {
      const selectedEngine = texEngineSelect.value as any;

      // Compile original résumé in parallel if not yet compiled so user can compare side-by-side
      if (!originalPdfBase64 && resumeText) {
        companionClient.compileLatex({ source: resumeText, engine: selectedEngine })
          .then(origResp => {
            const origData = origResp.pdfBase64 || (origResp as any).pdf_base64;
            if (origResp.success && origData) {
              updateOriginalPdfPreview(origData);
            }
          }).catch(() => {});
      }

      const result: LatexTailorResult = await latexTailorService.tailorAndCompile(
        resumeText,
        jdText,
        {
          engine: selectedEngine,
          onProgress: (_stage, message) => setLiveStatus(message),
        }
      );

      currentTailoredTex = result.finalSource;
      tailoredSourceView.value = result.finalSource;
      btnDownloadTex.disabled = false;
      btnRollback.disabled = false;

      renderDiff(result.diffLines);
      renderSemanticChanges(result.semanticChanges);
      renderDiagnostics(result.compileDiagnostics, 0, 0, result.engineUsed);

      if (result.compileSuccess && result.pdfBase64) {
        updateTailoredPdfPreview(result.pdfBase64);
        switchInspectTab('tab-pdf');
        setLiveStatus(`Compilation succeeded (${((result.pdfSize || 0) / 1024).toFixed(1)} KB PDF generated).`);
      } else {
        switchInspectTab('tab-diff');
        setLiveStatus(result.error || 'Tailoring applied. Companion compilation incomplete.');
      }

      // Keyword analysis in parallel
      analyzeKeywordGap(resumeText, jdText).then(gap => {
        keywordsPresentBox.innerHTML = gap.present.map(k => `<span class="keyword-badge present">${escapeHtml(k)}</span>`).join('');
        keywordsMissingBox.innerHTML = gap.missing.map(k => `<span class="keyword-badge missing">${escapeHtml(k)}</span>`).join('');
      }).catch(() => {});

    } catch (err) {
      console.error('Tailor LaTeX error:', err);
      setLiveStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      btnTailorMain.disabled = false;
      btnCompileOnly.disabled = false;
    }
  } else {
    // Plain text / Markdown mode
    try {
      setLiveStatus('Tailoring markdown résumé...');
      const tailored = await tailorResume(resumeText, jdText);
      tailoredSourceView.value = tailored;
      switchInspectTab('tab-source');
      setLiveStatus('Plain text résumé tailored successfully.');
    } catch (err) {
      setLiveStatus(`Tailor failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      btnTailorMain.disabled = false;
      btnCompileOnly.disabled = false;
    }
  }
});

btnCompileOnly?.addEventListener('click', async () => {
  const source = resumeEditor.value.trim();
  if (!source) {
    setLiveStatus('No LaTeX source to compile. Click "Load Sample" to load a template.');
    resumeEditor.focus();
    return;
  }

  btnCompileOnly.disabled = true;
  setLiveStatus('Sending LaTeX source to native companion compiler...');
  inspectionContainer.classList.add('visible');

  try {
    const selectedEngine = texEngineSelect.value as any;
    const resp = await companionClient.compileLatex({
      source,
      engine: selectedEngine,
    });

    renderDiagnostics(resp.diagnostics, resp.exitCode, resp.durationMs, resp.engineUsed);

    const pdfData = resp.pdfBase64 || (resp as any).pdf_base64;
    if (resp.success && pdfData) {
      if (currentTailoredTex) {
        updateTailoredPdfPreview(pdfData);
      } else {
        updateOriginalPdfPreview(pdfData);
      }
      switchInspectTab('tab-pdf');
      setLiveStatus(`Compilation succeeded in ${resp.durationMs ?? 0}ms.`);
    } else {
      switchInspectTab('tab-diagnostics');
      const errDetail = resp.diagnostics?.errors?.[0]?.message || resp.message || 'Compiler check failed';
      setLiveStatus(`Compilation failed (exit code ${resp.exitCode ?? 1}): ${errDetail}`);
    }
  } catch (err) {
    setLiveStatus(`Compiler error: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    btnCompileOnly.disabled = false;
  }
});

btnDownloadPdf?.addEventListener('click', () => {
  if (!currentPdfBlobUrl) return;
  const a = document.createElement('a');
  a.href = currentPdfBlobUrl;
  a.download = 'tailored_resume.pdf';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
});

btnDownloadTex?.addEventListener('click', () => {
  const content = tailoredSourceView.value || currentTailoredTex || resumeEditor.value;
  if (!content) return;
  const blob = new Blob([content], { type: 'text/x-tex;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'tailored_resume.tex';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

btnRollback?.addEventListener('click', () => {
  if (originalTexSource) {
    resumeEditor.value = originalTexSource;
    tailoredSourceView.value = originalTexSource;
    btnRollback.disabled = true;
    setLiveStatus('Rolled back to original résumé source.');
  }
});

btnScrapeJd?.addEventListener('click', async () => {
  setLiveStatus('Scraping job description from active tab...');
  try {
    const msg: any = { kind: 'SCRAPE_JOB_DESCRIPTION' };
    if (sourceTabId) msg.sourceTabId = sourceTabId;
    const response = await browser.runtime.sendMessage(msg);
    if (response?.text) {
      jdEditor.value = response.text;
      setLiveStatus('Job description scraped successfully.');
    } else {
      setLiveStatus('Could not extract job description from active tab. Please paste manually.');
    }
  } catch {
    setLiveStatus('Scrape request failed. Please paste the job description.');
  }
});

// Mode tab clicks
tabModeLatex?.addEventListener('click', () => switchMode('latex'));
tabModePlaintext?.addEventListener('click', () => switchMode('plaintext'));

// ── Initialization ─────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  setupInspectTabs();
  switchMode('latex');

  // Load profile resume if available
  try {
    const profile = await getUserProfile();
    if (profile?.resumeText) {
      if (profile.resumeText.includes('\\documentclass')) {
        resumeEditor.value = profile.resumeText;
        originalTexSource = profile.resumeText;
        setLiveStatus('Loaded LaTeX résumé from your active profile.');
      } else {
        // Plain text resume
        resumeEditor.value = SAMPLE_LATEX; // Default to rich sample for LaTeX mode
        originalTexSource = SAMPLE_LATEX;
        setLiveStatus('Ready. Loaded sample LaTeX résumé template.');
      }
    } else {
      resumeEditor.value = SAMPLE_LATEX;
      originalTexSource = SAMPLE_LATEX;
      setLiveStatus('Ready. Loaded sample LaTeX résumé.');
    }
  } catch {
    resumeEditor.value = SAMPLE_LATEX;
    originalTexSource = SAMPLE_LATEX;
  }

  // Load pending job description if opened from a job posting tab
  try {
    const data = await browser.storage.local.get([
      'pending_tailor_jd', 'pending_tailor_title', 'pending_tailor_company',
      'pending_tailor_source_tab',
    ]);
    if (data.pending_tailor_jd && typeof data.pending_tailor_jd === 'string' && data.pending_tailor_jd.length > 10) {
      jdEditor.value = data.pending_tailor_jd;
      const parts: string[] = [];
      if (data.pending_tailor_title) parts.push(data.pending_tailor_title);
      if (data.pending_tailor_company) parts.push(`at ${data.pending_tailor_company}`);
      setLiveStatus(`Target job loaded: ${parts.join(' ') || 'from job posting'}`);
    }
    if (data.pending_tailor_source_tab && typeof data.pending_tailor_source_tab === 'number') {
      sourceTabId = data.pending_tailor_source_tab;
    }
    await browser.storage.local.remove([
      'pending_tailor_jd', 'pending_tailor_title', 'pending_tailor_company', 'pending_tailor_source_tab'
    ]);
  } catch {
    // Ignore storage errors
  }

  await loadAIProviders();
  await checkCompanion();
}

init();
