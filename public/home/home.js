(async function () {
  const api = typeof browser !== 'undefined' ? browser : (typeof chrome !== 'undefined' ? chrome : null);
  const OLLAMA_URL = 'http://localhost:11434/api/tags';

  // Build an array of dailySummary_YYYY-MM-DD keys for the past N days.
  // Avoids browser.storage.local.get(null) which is unreliable in Firefox.
  function buildDailySummaryKeys(daysBack) {
    const keys = [];
    const today = new Date();
    for (let i = 0; i < daysBack; i++) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - i);
      keys.push('dailySummary_' + d.toISOString().split('T')[0]);
    }
    return keys;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function openPage(path) {
    if (api && api.runtime && api.runtime.getURL) {
      window.location.href = api.runtime.getURL(path);
    } else {
      window.location.href = '../' + path;
    }
  }

  // --- Navigation Wiring ---
  const navMap = [
    { id: 'navResumeTailorCard', path: 'resume-tailor/resume-tailor.html' },
    { id: 'navResumeTailorSide', path: 'resume-tailor/resume-tailor.html' },
    { id: 'navResumeTailorModule', path: 'resume-tailor/resume-tailor.html' },
    { id: 'emptyTailorBtn', path: 'resume-tailor/resume-tailor.html' },
    { id: 'navFindJobs', path: 'jobs/jobs.html' },
    { id: 'navFindJobsSide', path: 'jobs/jobs.html' },
    { id: 'emptyFindJobsBtn', path: 'jobs/jobs.html' },
    { id: 'navDashboard', path: 'dashboard/dashboard.html' },
    { id: 'navDashboardCard', path: 'dashboard/dashboard.html' },
    { id: 'navDashboardSide', path: 'dashboard/dashboard.html' },
    { id: 'navDashboardTableLink', path: 'dashboard/dashboard.html' },
    { id: 'navProfile', path: 'profiles/profiles.html' },
    { id: 'navProfileSide', path: 'profiles/profiles.html' },
    { id: 'navProfileModule', path: 'profiles/profiles.html' },
    { id: 'ctaSetup', path: 'onboarding/onboarding.html' },
    { id: 'navDataExplorer', path: 'data/data.html' },
    { id: 'navDataExplorerSide', path: 'data/data.html' },
    { id: 'navSettings', path: 'settings/settings.html' },
    { id: 'navSettingsSide', path: 'settings/settings.html' },
    { id: 'navHelp', path: 'help/help.html' },
    { id: 'navHelpSide', path: 'help/help.html' },
    { id: 'navPrivacy', path: 'privacy/privacy.html' },
    { id: 'footerPrivacy', path: 'privacy/privacy.html' },
    { id: 'footerHelp', path: 'help/help.html' },
    { id: 'footerSettings', path: 'settings/settings.html' }
  ];

  for (const item of navMap) {
    const el = document.getElementById(item.id);
    if (el) {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        openPage(item.path);
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openPage(item.path);
        }
      });
    }
  }

  const navLearned = document.getElementById('navLearned');
  if (navLearned) {
    const handleLearned = async (e) => {
      e?.preventDefault();
      try {
        if (api && api.storage && api.storage.local) {
          await api.storage.local.set({ showLearnedValues: true });
        }
      } catch (_) {}
      openPage('onboarding/onboarding.html');
    };
    navLearned.addEventListener('click', handleLearned);
    navLearned.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') handleLearned(e);
    });
  }

  // --- Quick Actions: Export / Import / Clear ---
  const actionExport = document.getElementById('actionExport');
  if (actionExport) {
    actionExport.addEventListener('click', async () => {
      try {
        if (!api?.storage?.local) {
          alert('Storage API unavailable in standalone browser preview.');
          return;
        }
        const data = await api.storage.local.get('userProfile');
        if (!data.userProfile) {
          alert('No profile found to export. Set up your profile first.');
          return;
        }
        const blob = new Blob([JSON.stringify(data.userProfile, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'private-apply-profile.json';
        a.click();
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error('Export failed:', err);
      }
    });
  }

  const actionImport = document.getElementById('actionImport');
  const actionImportInput = document.getElementById('actionImportInput');
  if (actionImport && actionImportInput) {
    actionImport.addEventListener('click', () => {
      actionImportInput.click();
    });

    actionImportInput.addEventListener('change', async () => {
      const file = actionImportInput.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const imported = JSON.parse(text);
        if (!imported || typeof imported !== 'object') {
          throw new Error('Invalid JSON format: file does not contain a valid JSON object.');
        }

        const profileData = imported.userProfile || imported;
        profileData.lastUpdated = Date.now();
        if (api?.storage?.local) {
          await api.storage.local.set({ userProfile: profileData });
        }
        alert('Profile imported successfully!');
        window.location.reload();
      } catch (err) {
        console.error('Import failed:', err);
        alert('Failed to import profile: ' + (err.message || err));
      } finally {
        actionImportInput.value = '';
      }
    });
  }

  const actionClear = document.getElementById('actionClear');
  if (actionClear) {
    actionClear.addEventListener('click', async () => {
      if (!confirm('Clear all tracked job applications? This action cannot be undone.')) return;
      try {
        if (api?.storage?.local) {
          const keysToRemove = buildDailySummaryKeys(365);
          await api.storage.local.remove(keysToRemove);
        }
        document.getElementById('statTotal').textContent = '0';
        document.getElementById('statInterviewing').textContent = '0';
        document.getElementById('statThisWeek').textContent = '0';
        const rateEl = document.getElementById('statRate');
        if (rateEl) rateEl.textContent = '0%';
        renderRecentApplications([]);
      } catch (err) {
        console.error('Clear failed:', err);
      }
    });
  }

  // --- Render Recent Applications Table ---
  function renderRecentApplications(apps) {
    const container = document.getElementById('recentAppsContainer');
    if (!container) return;

    if (!apps || apps.length === 0) {
      container.innerHTML = `
        <div class="recent-empty" id="recentAppsEmpty">
          <div class="empty-icon-wrap">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/>
            </svg>
          </div>
          <div class="empty-content">
            <h4>No applications recorded yet</h4>
            <p>When you auto-fill job applications on ATS portals (Workday, Greenhouse, Lever, etc.), submissions will automatically appear here.</p>
          </div>
          <div class="empty-actions">
            <a class="btn-sm-primary" id="emptyFindJobsBtn" role="button" tabindex="0">Find Matching Jobs</a>
            <a class="btn-sm-secondary" id="emptyTailorBtn" role="button" tabindex="0">Tailor Resume</a>
          </div>
        </div>
      `;
      document.getElementById('emptyFindJobsBtn')?.addEventListener('click', () => openPage('jobs/jobs.html'));
      document.getElementById('emptyTailorBtn')?.addEventListener('click', () => openPage('resume-tailor/resume-tailor.html'));
      return;
    }

    const sorted = [...apps].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 6);

    let html = `
      <div class="recent-table-wrap">
        <table class="recent-table">
          <thead>
            <tr>
              <th>Company &amp; Role</th>
              <th>Status</th>
              <th>Date</th>
              <th class="text-right">Action</th>
            </tr>
          </thead>
          <tbody>
    `;

    for (const app of sorted) {
      const dateStr = app.timestamp
        ? new Date(app.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        : 'Recent';
      const status = app.status || 'submitted';
      const statusClass = 'status-' + status.toLowerCase();
      const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
      const title = app.jobTitle || 'Application';
      const company = app.company || 'Direct Submission';
      const url = app.url || '';

      html += `
        <tr class="recent-row">
          <td>
            <div class="recent-job-info">
              <span class="recent-company">${escapeHtml(company)}</span>
              <span class="recent-title">${escapeHtml(title)}</span>
            </div>
          </td>
          <td>
            <span class="status-pill ${statusClass}">${escapeHtml(statusLabel)}</span>
          </td>
          <td class="recent-date">${dateStr}</td>
          <td class="text-right">
            ${
              url
                ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="recent-link" title="Open Job Posting"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>`
                : `<span class="recent-link-muted">&mdash;</span>`
            }
          </td>
        </tr>
      `;
    }

    html += `
          </tbody>
        </table>
      </div>
    `;

    container.innerHTML = html;
  }

  // --- Load Application Stats & Records ---
  try {
    if (api?.storage?.local) {
      const keys = buildDailySummaryKeys(365);
      const all = await api.storage.local.get(keys);
      let total = 0;
      let interviewing = 0;
      let thisWeek = 0;
      let responded = 0;
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const applicationsList = [];

      for (const key of keys) {
        const summary = all[key];
        if (!summary || !Array.isArray(summary.applications)) continue;
        for (const app of summary.applications) {
          if (app.status === 'detected') continue; // skip unsubmitted detections
          total++;
          if (app.status === 'interviewing') interviewing++;
          if (app.status === 'interviewing' || app.status === 'rejected' || app.status === 'accepted') responded++;
          if (app.timestamp && app.timestamp > weekAgo) thisWeek++;
          applicationsList.push(app);
        }
      }

      const responseRate = total > 0 ? Math.round((responded / total) * 100) : 0;

      const statTotalEl = document.getElementById('statTotal');
      if (statTotalEl) statTotalEl.textContent = String(total);

      const statIntEl = document.getElementById('statInterviewing');
      if (statIntEl) statIntEl.textContent = String(interviewing);

      const statWeekEl = document.getElementById('statThisWeek');
      if (statWeekEl) statWeekEl.textContent = String(thisWeek);

      const rateEl = document.getElementById('statRate');
      if (rateEl) rateEl.textContent = total > 0 ? responseRate + '%' : '—';

      renderRecentApplications(applicationsList);
    } else {
      renderRecentApplications([]);
    }
  } catch (err) {
    console.error('Failed to load stats:', err);
    renderRecentApplications([]);
  }

  // --- Load Profile Completion ---
  try {
    if (api?.storage?.local) {
      const data = await api.storage.local.get('userProfile');
      const profile = data.userProfile;

      if (profile) {
        let filled = 0;
        let fields = 0;

        const check = (val) => {
          fields++;
          if (val && String(val).trim()) filled++;
        };

        check(profile.personal?.firstName);
        check(profile.personal?.lastName);
        check(profile.personal?.email);
        check(profile.personal?.phone);
        check(profile.personal?.location);
        check(profile.professional?.linkedin);
        check(profile.professional?.github);
        check(profile.professional?.portfolio);
        check(profile.skills?.length > 0 ? 'yes' : '');
        check(profile.summary);

        const pct = fields > 0 ? Math.round((filled / fields) * 100) : 0;
        const fillEl = document.getElementById('profileFill');
        if (fillEl) {
          fillEl.style.transform = 'scaleX(' + (pct / 100) + ')';
          fillEl.style.width = '100%';
        }

        const pctEl = document.getElementById('profilePct');
        if (pctEl) pctEl.textContent = pct + '%';

        const labelEl = document.getElementById('profileLabel');
        const badgeEl = document.getElementById('workflowStatusBadge');
        const ctaTitle = document.getElementById('ctaTitle');
        const ctaSubtitle = document.getElementById('ctaSubtitle');

        if (pct >= 80) {
          if (labelEl) labelEl.textContent = 'Profile Complete';
          if (badgeEl) badgeEl.textContent = 'Active & Ready';
          if (ctaTitle) ctaTitle.textContent = 'Edit Profile';
          if (ctaSubtitle) ctaSubtitle.textContent = 'Profile is ready for auto-fill';
        } else if (pct > 0) {
          if (labelEl) labelEl.textContent = 'Profile In Progress';
          if (badgeEl) badgeEl.textContent = 'Setup in Progress';
          if (ctaTitle) ctaTitle.textContent = 'Continue Setup';
          if (ctaSubtitle) ctaSubtitle.textContent = 'Finish filling details for best results';
        } else {
          if (labelEl) labelEl.textContent = 'Setup Required';
          if (badgeEl) badgeEl.textContent = 'Setup Required';
          if (ctaTitle) ctaTitle.textContent = 'Setup Profile';
        }
      }
    }
  } catch (err) {
    console.error('Failed to load profile:', err);
  }

  // --- Ollama Connection Health Check ---
  try {
    const res = await fetch(OLLAMA_URL, { method: 'GET', signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      document.getElementById('ollamaDot')?.classList.add('connected');
      const textEl = document.getElementById('ollamaText');
      if (textEl) textEl.textContent = 'Ollama Connected';
      document.getElementById('ollamaStatus')?.classList.add('connected');
    } else {
      throw new Error('Ollama returned error');
    }
  } catch {
    document.getElementById('ollamaDot')?.classList.add('disconnected');
    const textEl = document.getElementById('ollamaText');
    if (textEl) textEl.textContent = 'Ollama Offline';
    const chip = document.getElementById('ollamaStatus');
    if (chip) {
      chip.classList.add('clickable');
      chip.title = 'Click to configure local Ollama setup in onboarding';
      chip.addEventListener('click', () => openPage('onboarding/onboarding.html'));
    }
  }
})();
