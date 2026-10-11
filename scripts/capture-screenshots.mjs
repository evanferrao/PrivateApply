import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const CHROME_PORT = 9222;
const SERVER_URL = 'http://127.0.0.1:8080';
const ASSETS_DIR = path.resolve('assets');

if (!fs.existsSync(ASSETS_DIR)) {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  return res.json();
}

class CdpConnection {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 1;
    this.callbacks = new Map();
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.callbacks.has(msg.id)) {
        const { resolve, reject } = this.callbacks.get(msg.id);
        this.callbacks.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    };
  }

  async ready() {
    if (this.ws.readyState === WebSocket.OPEN) return;
    return new Promise((resolve, reject) => {
      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(e);
    });
  }

  async send(method, params = {}) {
    await this.ready();
    const id = this.id++;
    return new Promise((resolve, reject) => {
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    return this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
  }

  close() {
    try {
      this.ws.close();
    } catch {}
  }
}

async function captureTarget({ url, filename, width = 1280, height = 800, deviceScaleFactor = 2, preloadScript, setupFn }) {
  console.log(`[Screenshot] Navigating to ${url}...`);
  // Create a new target
  const newTarget = await fetchJson(`http://127.0.0.1:${CHROME_PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  const cdp = new CdpConnection(newTarget.webSocketDebuggerUrl);

  try {
    await cdp.ready();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor,
      mobile: false
    });

    if (preloadScript) {
      await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: preloadScript });
      await cdp.send('Page.navigate', { url });
    }

    // Wait for load
    await sleep(2500);

    if (setupFn) {
      await cdp.evaluate(`(${setupFn.toString()})()`);
      await sleep(1200);
    }

    const { data } = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false
    });

    const outPath = path.join(ASSETS_DIR, filename);
    fs.writeFileSync(outPath, Buffer.from(data, 'base64'));
    console.log(`[Screenshot] ✓ Saved -> ${outPath}`);
  } finally {
    cdp.close();
    try {
      await fetch(`http://127.0.0.1:${CHROME_PORT}/json/close/${newTarget.id}`);
    } catch {}
  }
}

async function main() {
  console.log('[Screenshot] Connecting to Chrome on port', CHROME_PORT);
  let chrome = null;
  try {
    await fetchJson(`http://127.0.0.1:${CHROME_PORT}/json/version`);
  } catch {
    console.log('[Screenshot] Spawning headless Chrome...');
    chrome = spawn('google-chrome', [
      '--headless=new',
      `--remote-debugging-port=${CHROME_PORT}`,
      '--user-data-dir=/tmp/chrome-ss-profile',
      '--window-size=1280,800',
      '--no-sandbox',
      '--disable-gpu',
      '--hide-scrollbars'
    ]);
    for (let i = 0; i < 20; i++) {
      try {
        await fetchJson(`http://127.0.0.1:${CHROME_PORT}/json/version`);
        break;
      } catch {
        await sleep(200);
      }
    }
  }

  try {
    // 1. Home / Workspace
    await captureTarget({
      url: `${SERVER_URL}/home/home.html`,
      filename: 'ss4.png',
      width: 1280,
      height: 820,
      setupFn: () => {
        // Enhance with visual stats if empty
        const statNums = document.querySelectorAll('.stat-card .num, .metric-value, .stat-num');
        if (statNums.length >= 3) {
          statNums[0].textContent = '14';
          statNums[1].textContent = '4';
          statNums[2].textContent = '3';
        }
      }
    });

    // 2. Profiles Hub - Personal Information
    await captureTarget({
      url: `${SERVER_URL}/profiles/profiles.html`,
      filename: 'ss-profiles.png',
      width: 1280,
      height: 820,
      setupFn: () => {
        const setVal = (id, val) => {
          const el = document.getElementById(id);
          if (el) el.value = val;
        };
        setVal('core-first-name', 'Sarah');
        setVal('core-last-name', 'Connor');
        setVal('core-full-name', 'Sarah Jean Connor');
        setVal('core-preferred-name', 'Sarah');
        setVal('core-email', 'sarah.connor@cyberdyne-defense.org');
        setVal('core-mobile-code', '+1');
        setVal('core-mobile-number', '4155550199');
        setVal('core-address', 'Los Angeles, CA, USA');
        setVal('core-nationality', 'United States');
        const role = document.getElementById('hero-profile-role');
        if (role) role.textContent = 'Staff Systems & AI Resilience Engineer';
        const name = document.getElementById('hero-profile-name');
        if (name) name.textContent = 'Sarah Connor';
      }
    });

    // 3. Profiles Hub - Consents & Legal Authorizations
    await captureTarget({
      url: `${SERVER_URL}/profiles/profiles.html`,
      filename: 'ss-consents.png',
      width: 1280,
      height: 860,
      setupFn: () => {
        // Switch to Screening & Disclosures tab
        const tabBtn = document.querySelector('[data-tab="tab-screening"]');
        if (tabBtn) tabBtn.click();
        
        // Scroll into view of Consents & Legal section
        const consentHeader = document.querySelector('.consent-grid') || document.querySelector('.screening-section') || document.querySelector('#tab-screening');
        if (consentHeader) {
          consentHeader.scrollIntoView({ behavior: 'instant', block: 'start' });
        }

        // Check key consent boxes
        const cbs = document.querySelectorAll('#tab-screening input[type="checkbox"]');
        cbs.forEach((cb, idx) => {
          if (idx < 6) cb.checked = true;
        });
      }
    });

    // 4. Settings - GitHub Secret Gist Sync Section
    await captureTarget({
      url: `${SERVER_URL}/settings/settings.html#section-gist-sync`,
      filename: 'ss-gist-sync.png',
      width: 1280,
      height: 840,
      setupFn: () => {
        const gistSection = document.getElementById('section-gist-sync');
        if (gistSection) {
          gistSection.scrollIntoView({ behavior: 'instant', block: 'start' });
        }
        const tokenInput = document.getElementById('gist-pat-token');
        if (tokenInput) tokenInput.value = 'github_pat_11AB34...90xyzSecretGistToken';
        const gistIdInput = document.getElementById('gist-id-input');
        if (gistIdInput) gistIdInput.value = '8f64a13d7120e29b1248c89b917fa91c';
        const statusPill = document.getElementById('gist-status-pill');
        if (statusPill) {
          statusPill.textContent = 'Connected (Private Gist)';
          statusPill.style.background = 'rgba(16, 185, 129, 0.15)';
          statusPill.style.color = '#10b981';
          statusPill.style.borderColor = 'rgba(16, 185, 129, 0.3)';
        }
        const syncTime = document.getElementById('gist-last-sync-time');
        if (syncTime) syncTime.textContent = 'Synced 2 minutes ago (Gist: 8f64a13d)';
        const autoSync = document.getElementById('toggle-gist-autosync');
        if (autoSync) autoSync.classList.add('active');
      }
    });

    // 5. Settings - AI Models & Providers
    await captureTarget({
      url: `${SERVER_URL}/settings/settings.html`,
      filename: 'ss-settings.png',
      width: 1280,
      height: 820,
      setupFn: () => {
        window.scrollTo(0, 0);
      }
    });

    // 6. Data Graph & RL Memory Explorer
    await captureTarget({
      url: `${SERVER_URL}/data/data.html`,
      filename: 'ss-data-graph.png',
      width: 1280,
      height: 820,
      preloadScript: `
        localStorage.setItem('graph_nodes', JSON.stringify({
          'n1': { id: 'n1', label: 'First Name', type: 'field', value: 'Sarah', confidence: 0.98 },
          'n2': { id: 'n2', label: 'Email Address', type: 'field', value: 'sarah.connor@cyberdyne.org', confidence: 1.0 },
          'n3': { id: 'n3', label: 'WhatsApp Consent', type: 'consent', value: true, confidence: 1.0 },
          'n4': { id: 'n4', label: 'Phone Number', type: 'field', value: '+14155550199', confidence: 0.95 },
          'n5': { id: 'n5', label: 'DNC Bypass', type: 'consent', value: true, confidence: 1.0 },
          'n6': { id: 'n6', label: 'LaTeX Resume', type: 'document', value: 'resume.tex', confidence: 0.99 }
        }));
        localStorage.setItem('graph_edges', JSON.stringify({
          'e1': { id: 'e1', source: 'n1', target: 'n2', relationship: 'IDENTIFIES', weight: 1.0 },
          'e2': { id: 'e2', source: 'n4', target: 'n3', relationship: 'CONTACT_VIA', weight: 0.95 },
          'e3': { id: 'e3', source: 'n4', target: 'n5', relationship: 'AUTHORIZES', weight: 0.95 }
        }));
        localStorage.setItem('graph_meta', JSON.stringify({ schemaVersion: 1, nodeCount: 6, edgeCount: 3, lastUpdated: Date.now() }));
        localStorage.setItem('userProfile', JSON.stringify({
          personal: { name: 'Sarah Connor', email: 'sarah.connor@cyberdyne.org', phone: '+14155550199', location: 'Los Angeles, CA' },
          skills: ['Distributed Systems', 'Kubernetes', 'TypeScript', 'LaTeX', 'Local AI', 'Linux Systems'],
          experience: [{ title: 'Staff Systems Engineer', company: 'Cyberdyne Defense', period: '2023 - Present' }]
        }));
      `,
      setupFn: () => {
        // Switch to Graph Memory tab
        const tabBtns = document.querySelectorAll('button, .tab-btn');
        for (const btn of tabBtns) {
          if (btn.textContent && btn.textContent.includes('Graph Memory')) {
            btn.click();
            break;
          }
        }
      }
    });

    // 7. AI Resume & LaTeX Tailor
    await captureTarget({
      url: `${SERVER_URL}/resume-tailor/resume-tailor.html`,
      filename: 'ss-resume-tailor.png',
      width: 1280,
      height: 820,
      setupFn: () => {
        const jd = document.querySelector('textarea, .jd-input');
        if (jd) {
          jd.value = "We are seeking a Staff Infrastructure Engineer with deep experience in distributed systems, Kubernetes, and local LLM deployment pipelines. Experience with Linux systems programming and high-throughput microservices required.";
        }
      }
    });

    // 8. Application Tracker Kanban
    await captureTarget({
      url: `${SERVER_URL}/dashboard/dashboard.html`,
      filename: 'ss-dashboard.png',
      width: 1280,
      height: 820,
      preloadScript: `
        const today = new Date().toISOString().split('T')[0];
        const apps = [
          { id: '1', company: 'Anthropic', jobTitle: 'Staff AI Systems Engineer', status: 'interviewing', timestamp: Date.now() - 86400000, atsHint: 'Greenhouse', url: 'https://anthropic.com/jobs/1' },
          { id: '2', company: 'Stripe', jobTitle: 'Staff Infrastructure Engineer', status: 'interviewing', timestamp: Date.now() - 86400000 * 2, atsHint: 'Greenhouse', url: 'https://stripe.com/jobs/2' },
          { id: '3', company: 'Linear', jobTitle: 'Senior Full Stack Engineer', status: 'accepted', timestamp: Date.now() - 86400000 * 3, atsHint: 'Custom', url: 'https://linear.app/jobs/3' },
          { id: '4', company: 'Airbnb', jobTitle: 'Staff Platform Engineer', status: 'submitted', timestamp: Date.now() - 86400000 * 4, atsHint: 'Workday', url: 'https://airbnb.com/jobs/4' },
          { id: '5', company: 'Vercel', jobTitle: 'Developer Experience Engineer', status: 'submitted', timestamp: Date.now() - 86400000 * 5, atsHint: 'Lever', url: 'https://vercel.com/jobs/5' },
          { id: '6', company: 'Figma', jobTitle: 'Senior Frontend Systems Engineer', status: 'rejected', timestamp: Date.now() - 86400000 * 10, atsHint: 'Greenhouse', url: 'https://figma.com/jobs/6' }
        ];
        localStorage.setItem('dailySummary_' + today, JSON.stringify({ date: today, applications: apps, lastSentAt: null }));
        localStorage.setItem('job_applications', JSON.stringify(apps));
      `
    });

    // 9. Profile Onboarding Wizard (ss3.png)
    await captureTarget({
      url: `${SERVER_URL}/onboarding/onboarding.html`,
      filename: 'ss3.png',
      width: 1280,
      height: 820
    });

    // 10. Extension Popup (ss1.png)
    await captureTarget({
      url: `${SERVER_URL}/popup/popup.html`,
      filename: 'ss1.png',
      width: 440,
      height: 600,
      deviceScaleFactor: 2,
      preloadScript: `
        localStorage.setItem('ofl-tour-done-popup', '1');
        localStorage.setItem('ofl-tour-pending', 'false');
      `,
      setupFn: () => {
        // Remove tour overlay if any
        document.getElementById('ofl-tour-overlay')?.remove();
        document.getElementById('ofl-tour-tooltip')?.remove();

        const ollamaStatus = document.getElementById('ollamaStatus') || document.querySelector('.ollama-status');
        if (ollamaStatus) {
          ollamaStatus.textContent = 'Ollama Connected (llama3.2)';
          ollamaStatus.style.color = '#10b981';
        }
      }
    });

    console.log('[Screenshot] All screenshots captured successfully!');
  } finally {
    if (chrome) chrome.kill('SIGTERM');
  }
}

main().catch(err => {
  console.error('[Screenshot] Error:', err);
  process.exit(1);
});
