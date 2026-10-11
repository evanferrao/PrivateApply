/**
 * Job Applications Dashboard - Kanban Board
 * Displays applications in status columns with edit/delete functionality
 */

import browser from '../shared/browser-compat';
import { setHTML } from '../shared/html';
import {
  getAllApplications,
  getApplicationStats,
  getApplicationTrends,
  updateApplicationStatus,
  deleteApplication,
  type ApplicationStats,
  type DailyTrend,
} from '../shared/storage';
import type { JobApplication } from '../shared/types';
import { getActiveProfileId, listProfiles } from '../shared/profile';

// Chart.js type (loaded via CDN)
declare const Chart: any;

let allApplications: JobApplication[] = [];
let filteredApplications: JobApplication[] = [];
let trendChart: any = null;
let statusChart: any = null;
let currentEditingApp: JobApplication | null = null;

/**
 * Initialize dashboard on page load
 */
async function init() {
  console.log('Dashboard initializing...');

  // Show active profile indicator in header
  try {
    const activeId = await getActiveProfileId();
    const profiles = await listProfiles();
    const activeMeta = profiles.find(p => p.id === activeId);
    if (activeMeta) {
      const headerBrand = document.querySelector('.header-brand');
      if (headerBrand) {
        const badge = document.createElement('div');
        badge.className = 'profile-indicator-pill';
        const dot = document.createElement('span');
        dot.style.cssText = `width:8px;height:8px;border-radius:50%;background:${activeMeta.color || '#707953'};display:inline-block;flex-shrink:0;`;
        const label = document.createElement('span');
        label.textContent = activeMeta.name || 'My Profile';
        badge.appendChild(dot);
        badge.appendChild(label);
        headerBrand.appendChild(badge);
      }
    }
  } catch (_) { /* non-critical */ }
  
  // Load data
  await loadDashboardData();
  
  // Setup event listeners
  setupEventListeners();
  
  // Initial render
  renderDashboard();
  
  console.log('Dashboard initialized with', allApplications.length, 'applications');
}

/**
 * Load all dashboard data
 */
async function loadDashboardData() {
  try {
    console.log('[Dashboard] Loading data...');
    allApplications = await getAllApplications();
    filteredApplications = [...allApplications];
    console.log('[Dashboard] Loaded', allApplications.length, 'applications');

    if (allApplications.length === 0) {
      console.warn('[Dashboard] No applications found. User may not have submitted any applications yet, or use "Generate Test Data" to populate.');
    }
  } catch (err) {
    console.error('[Dashboard] Failed to load dashboard data:', err);
    showError('Failed to load applications data');
  }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Search input
  const searchInput = document.getElementById('searchInput') as HTMLInputElement;
  searchInput?.addEventListener('input', handleSearch);

  // Filter dropdown
  const filterStatus = document.getElementById('filterStatus') as HTMLSelectElement;
  filterStatus?.addEventListener('change', handleSearch);
  
  // Export button
  const exportBtn = document.getElementById('exportBtn');
  exportBtn?.addEventListener('click', handleExport);

  // Import button
  const importBtn = document.getElementById('importBtn');
  const importFileInput = document.getElementById('importFileInput') as HTMLInputElement | null;
  importBtn?.addEventListener('click', () => {
    importFileInput?.click();
  });
  importFileInput?.addEventListener('change', handleImport);
  
  // Edit form
  const editForm = document.getElementById('editForm');
  editForm?.addEventListener('submit', handleEditSubmit);

  // Cancel edit button (replaces inline onclick to satisfy CSP)
  const cancelEditBtn = document.getElementById('cancelEditBtn');
  cancelEditBtn?.addEventListener('click', closeEditModal);

  // Clear Data modal controls
  const clearDataBtn = document.getElementById('clearDataBtn');
  const clearDataModal = document.getElementById('clearDataModal');
  const cancelClearDataBtn = document.getElementById('cancelClearDataBtn');
  const confirmClearDataBtn = document.getElementById('confirmClearDataBtn');

  clearDataBtn?.addEventListener('click', () => {
    clearDataModal?.classList.add('active');
  });

  cancelClearDataBtn?.addEventListener('click', () => {
    clearDataModal?.classList.remove('active');
  });

  clearDataModal?.addEventListener('click', (e) => {
    if (e.target === clearDataModal) {
      clearDataModal.classList.remove('active');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && clearDataModal?.classList.contains('active')) {
      clearDataModal.classList.remove('active');
    }
  });

  confirmClearDataBtn?.addEventListener('click', executeClearAllData);

  // Learned Values button — set the deep-link flag and open the onboarding page
  const viewLearnedBtn = document.getElementById('viewLearnedValuesBtn');
  viewLearnedBtn?.addEventListener('click', async () => {
    try {
      await browser.storage.local.set({ showLearnedValues: true });
      window.location.href = '../onboarding/onboarding.html';
    } catch (err) {
      console.error('[Dashboard] Failed to open learned values:', err);
    }
  });
}

/**
 * Main render function
 */
async function renderDashboard() {
  await renderStats();
  renderKanbanBoard();
  await renderCharts();
}

/**
 * Render statistics cards
 */
async function renderStats() {
  try {
    const stats = await getApplicationStats();
    
    // Update stat cards
    setElementText('statTotal', stats.total.toString());
    setElementText('statSubmitted', stats.submitted.toString());
    setElementText('statInterviewing', stats.interviewing.toString());
    setElementText('statAccepted', stats.accepted.toString());
    setElementText('statRejected', stats.rejected.toString());
    
    // Response rate semantics: em dash if no applications / zero denominator
    const rateEl = document.getElementById('statRate');
    const rateCard = document.querySelector('.stat-card.rate') as HTMLElement | null;
    const rateSubtextSpan = rateCard?.querySelector('.stat-subtext span');

    if (stats.total === 0) {
      if (rateEl) rateEl.textContent = '—';
      if (rateSubtextSpan) rateSubtextSpan.textContent = 'No data yet';
      if (rateCard) {
        rateCard.title = 'Response Rate: Requires recorded applications to calculate ([Interviewing + Accepted + Rejected] ÷ Total).';
      }
    } else {
      if (rateEl) rateEl.textContent = `${stats.responseRate}%`;
      const responded = stats.interviewing + stats.accepted + stats.rejected;
      if (rateSubtextSpan) rateSubtextSpan.textContent = `${responded} of ${stats.total} responded`;
      if (rateCard) {
        rateCard.title = `Response Rate: ${stats.responseRate}% (${responded} responded out of ${stats.total} applications = [Interviewing + Accepted + Rejected] ÷ Total)`;
      }
    }
    
    // Update date range
    if (stats.dateRange.earliest && stats.dateRange.latest) {
      const dateText = stats.dateRange.earliest === stats.dateRange.latest
        ? formatDate(stats.dateRange.earliest)
        : `${formatDate(stats.dateRange.earliest)} - ${formatDate(stats.dateRange.latest)}`;
      setElementText('dateRange', dateText);
    } else {
      setElementText('dateRange', 'No applications yet');
    }
  } catch (err) {
    console.error('Failed to render stats:', err);
  }
}

/**
 * Render Kanban board with status columns
 */
function renderKanbanBoard() {
  const container = document.getElementById('kanbanContent');
  if (!container) return;
  
  if (filteredApplications.length === 0) {
    setHTML(container, `
      <div class="empty-state">
        <h3>No applications found</h3>
        <p>${allApplications.length === 0 ? 'Start submitting applications and they will appear here' : 'Try adjusting your search'}</p>
      </div>
    `);
    return;
  }
  
  // Group applications by status
  const columns = {
    submitted: filteredApplications.filter(a => a.status === 'submitted'),
    interviewing: filteredApplications.filter(a => a.status === 'interviewing'),
    rejected: filteredApplications.filter(a => a.status === 'rejected'),
    accepted: filteredApplications.filter(a => a.status === 'accepted'),
    withdrawn: filteredApplications.filter(a => a.status === 'withdrawn'),
  };
  
  setHTML(container, `
    <div class="kanban-board">
      ${createKanbanColumn('submitted', 'Submitted', columns.submitted)}
      ${createKanbanColumn('interviewing', 'Interviewing', columns.interviewing)}
      ${createKanbanColumn('rejected', 'Rejected', columns.rejected)}
      ${createKanbanColumn('accepted', 'Accepted', columns.accepted)}
      ${createKanbanColumn('withdrawn', 'Withdrawn', columns.withdrawn)}
    </div>
  `);
  
  // Attach event listeners to cards
  attachCardListeners();
}

/**
 * Create a Kanban column (drop zone)
 */
function createKanbanColumn(status: string, title: string, apps: JobApplication[]): string {
  const cardsHTML = apps.map(app => createApplicationCard(app)).join('');
  
  return `
    <div class="kanban-column" data-status="${status}">
      <div class="column-header ${status}">
        <span>${title}</span>
        <span class="count">${apps.length}</span>
      </div>
      <div class="column-cards" data-status="${status}">
        ${cardsHTML || '<div class="empty-state"><p>No applications</p></div>'}
      </div>
    </div>
  `;
}

/**
 * Create application card HTML
 */
function createApplicationCard(app: JobApplication): string {
  const date = new Date(app.timestamp);
  const dateStr = formatDate(date.toISOString().split('T')[0]);
  const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  
  return `
    <div class="app-card" data-app-id="${app.id}" draggable="true">
      <div class="app-card-header">
        <div class="app-card-title">${escapeHtml(app.jobTitle)}</div>
        <div class="app-card-company">${escapeHtml(app.company)}</div>
      </div>
      ${app.atsHint ? `<div class="ats-badge">${escapeHtml(app.atsHint)}</div>` : ''}
      ${app.notes ? `<div class="app-card-meta"><div style="color: #4a5568;">${escapeHtml(app.notes)}</div></div>` : ''}
      <div class="app-card-meta">
        <div>${dateStr} at ${timeStr}</div>
      </div>
      <div class="app-card-actions">
        <button class="btn-edit" data-action="edit">Edit</button>
        <button class="btn-delete" data-action="delete">Delete</button>
      </div>
    </div>
  `;
}

/**
 * Attach event listeners to card buttons and drag-and-drop
 */
function attachCardListeners() {
  // --- Card button listeners ---
  document.querySelectorAll('.app-card').forEach(card => {
    const appId = card.getAttribute('data-app-id');
    if (!appId) return;
    
    // Edit button
    const editBtn = card.querySelector('[data-action="edit"]');
    editBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      handleEdit(appId);
    });
    
    // Delete button
    const deleteBtn = card.querySelector('[data-action="delete"]');
    deleteBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      handleDelete(appId);
    });
    
    // Click card to open URL (only if not a drag)
    let didDrag = false;
    card.addEventListener('mousedown', () => { didDrag = false; });
    card.addEventListener('mousemove', () => { didDrag = true; });
    card.addEventListener('click', () => {
      if (didDrag) return;
      const app = allApplications.find(a => a.id === appId);
      if (app) {
        browser.tabs.create({ url: app.url });
      }
    });
    
    // --- Drag start ---
    card.addEventListener('dragstart', (e) => {
      const de = e as DragEvent;
      card.classList.add('dragging');
      de.dataTransfer?.setData('text/plain', appId);
      if (de.dataTransfer) {
        de.dataTransfer.effectAllowed = 'move';
      }
    });
    
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
    });
  });
  
  // --- Column drop zone listeners ---
  document.querySelectorAll('.kanban-column').forEach(column => {
    column.addEventListener('dragover', (e) => {
      e.preventDefault();
      (e as DragEvent).dataTransfer!.dropEffect = 'move';
      column.classList.add('drag-over');
    });
    
    column.addEventListener('dragleave', (e) => {
      // Only remove highlight if we actually left the column, not just entered a child
      const related = (e as MouseEvent).relatedTarget as Node | null;
      if (related && column.contains(related)) return;
      column.classList.remove('drag-over');
    });
    
    column.addEventListener('drop', async (e) => {
      e.preventDefault();
      column.classList.remove('drag-over');
      
      const appId = (e as DragEvent).dataTransfer?.getData('text/plain');
      const newStatus = column.getAttribute('data-status') as JobApplication['status'];
      
      if (!appId || !newStatus) return;
      
      // Find the app's current status to avoid no-op updates
      const app = allApplications.find(a => a.id === appId);
      if (!app || app.status === newStatus) return;
      
      // Persist the status change
      const success = await updateApplicationStatus(appId, newStatus);
      if (success) {
        await loadDashboardData();
        renderDashboard();
      }
    });
  });
}

/**
 * Handle edit button click
 */
function handleEdit(appId: string) {
  const app = allApplications.find(a => a.id === appId);
  if (!app) return;
  
  currentEditingApp = app;
  
  // Populate edit form
  const companyInput = document.getElementById('editCompany') as HTMLInputElement;
  const positionInput = document.getElementById('editPosition') as HTMLInputElement;
  const statusSelect = document.getElementById('editStatus') as HTMLSelectElement;
  const notesTextarea = document.getElementById('editNotes') as HTMLTextAreaElement;
  
  if (companyInput) companyInput.value = app.company;
  if (positionInput) positionInput.value = app.jobTitle;
  if (statusSelect) statusSelect.value = app.status;
  if (notesTextarea) notesTextarea.value = app.notes || '';
  
  // Show modal
  const modal = document.getElementById('editModal');
  modal?.classList.add('active');
}

/**
 * Handle edit form submit
 */
async function handleEditSubmit(e: Event) {
  e.preventDefault();
  
  if (!currentEditingApp) return;
  
  const statusSelect = document.getElementById('editStatus') as HTMLSelectElement;
  const notesTextarea = document.getElementById('editNotes') as HTMLTextAreaElement;
  
  const newStatus = statusSelect.value as JobApplication['status'];
  const newNotes = notesTextarea.value;
  
  // Update application
  const success = await updateApplicationStatus(currentEditingApp.id!, newStatus, newNotes);
  
  if (success) {
    // Reload data and re-render
    await loadDashboardData();
    renderDashboard();
    closeEditModal();
  } else {
    alert('Failed to update application. Please try again.');
  }
}

/**
 * Close edit modal
 */
function closeEditModal() {
  const modal = document.getElementById('editModal');
  modal?.classList.remove('active');
  currentEditingApp = null;
}

// closeEditModal is wired via addEventListener in setupEventListeners — no global needed

/**
 * Handle delete button click
 */
async function handleDelete(appId: string) {
  const app = allApplications.find(a => a.id === appId);
  if (!app) return;
  
  const confirmed = confirm(`Delete application for ${app.jobTitle} at ${app.company}?`);
  
  if (confirmed) {
    const success = await deleteApplication(appId);
    
    if (success) {
      // Reload data and re-render
      await loadDashboardData();
      renderDashboard();
    } else {
      alert('Failed to delete application. Please try again.');
    }
  }
}

/**
 * Handle search
 */
function handleSearch() {
  const searchInput = document.getElementById('searchInput') as HTMLInputElement;
  const filterStatus = document.getElementById('filterStatus') as HTMLSelectElement;
  const searchTerm = searchInput?.value.toLowerCase() || '';
  const statusFilter = filterStatus?.value || 'all';

  filteredApplications = allApplications.filter(app => {
    const matchesSearch = !searchTerm || (
      app.jobTitle.toLowerCase().includes(searchTerm) ||
      app.company.toLowerCase().includes(searchTerm) ||
      (app.notes?.toLowerCase().includes(searchTerm) ?? false)
    );
    const matchesStatus = statusFilter === 'all' || app.status === statusFilter;
    return matchesSearch && matchesStatus;
  });
  
  renderKanbanBoard();
}

/**
 * Render Chart.js charts
 */
async function renderCharts() {
  try {
    let trends = await getApplicationTrends();
    
    // Destroy existing charts if any
    if (trendChart) {
      trendChart.destroy();
      trendChart = null;
    }
    if (statusChart) {
      statusChart.destroy();
      statusChart = null;
    }

    const trendCanvas = document.getElementById('trendChart') as HTMLCanvasElement | null;
    const trendEmpty = document.getElementById('trendChartEmpty') as HTMLElement | null;
    const statusCanvas = document.getElementById('statusChart') as HTMLCanvasElement | null;
    const statusEmpty = document.getElementById('statusChartEmpty') as HTMLElement | null;

    if (allApplications.length === 0) {
      if (trendCanvas) trendCanvas.style.display = 'none';
      if (trendEmpty) trendEmpty.style.display = 'flex';
      if (statusCanvas) statusCanvas.style.display = 'none';
      if (statusEmpty) statusEmpty.style.display = 'flex';
      return;
    }

    // Edge case: if dailySummary trend records are missing/empty but applications exist
    // (e.g. from imported CSV or fresh records), derive daily trend points from allApplications
    if (trends.length === 0 && allApplications.length > 0) {
      const dateMap = new Map<string, { total: number; submitted: number; interviewing: number; rejected: number; accepted: number; withdrawn: number }>();
      const sortedApps = [...allApplications].sort((a, b) => a.timestamp - b.timestamp);
      for (const app of sortedApps) {
        const d = new Date(app.timestamp).toISOString().split('T')[0];
        if (!dateMap.has(d)) {
          dateMap.set(d, { total: 0, submitted: 0, interviewing: 0, rejected: 0, accepted: 0, withdrawn: 0 });
        }
        const entry = dateMap.get(d)!;
        entry.total++;
        if (app.status === 'submitted') entry.submitted++;
        if (app.status === 'interviewing') entry.interviewing++;
        if (app.status === 'rejected') entry.rejected++;
        if (app.status === 'accepted') entry.accepted++;
        if (app.status === 'withdrawn') entry.withdrawn++;
      }
      trends = Array.from(dateMap.entries()).map(([date, data]) => ({
        date,
        total: data.total,
        submitted: data.submitted,
        interviewing: data.interviewing,
        rejected: data.rejected,
        accepted: data.accepted,
        withdrawn: data.withdrawn,
      }));
    }

    // Applications Over Time
    if (trendCanvas) trendCanvas.style.display = 'block';
    if (trendEmpty) trendEmpty.style.display = 'none';
    renderTrendChart(trends);

    // Status Distribution
    if (statusCanvas) statusCanvas.style.display = 'block';
    if (statusEmpty) statusEmpty.style.display = 'none';
    renderStatusChart();
  } catch (err) {
    console.error('Failed to render charts:', err);
  }
}

/**
 * Returns true when dark mode is active (html.dark class present)
 */
function isDarkMode(): boolean {
  return document.documentElement.classList.contains('dark');
}

/**
 * Chart theme colours — swaps based on current dark/light mode
 */
function chartTheme() {
  const dark = isDarkMode();
  return {
    gridColor: dark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(112, 121, 83, 0.12)',
    tickColor: dark ? '#a5ad85' : '#727a52',
    legendColor: dark ? '#e9ebe0' : '#1d1f14',
    // Total: Sophisticated Slate Indigo
    totalLine: dark ? '#818cf8' : '#4f46e5',
    totalFill: dark ? 'rgba(129, 140, 248, 0.18)' : 'rgba(79, 70, 229, 0.12)',
    // Submitted: Warm Amber
    submittedLine: dark ? '#fbbf24' : '#d97706',
    submittedFill: dark ? 'rgba(251, 191, 36, 0.18)' : 'rgba(217, 119, 6, 0.12)',
    // Interviewing: Royal Violet
    interviewingLine: dark ? '#c084fc' : '#9333ea',
    interviewingFill: dark ? 'rgba(192, 132, 252, 0.18)' : 'rgba(147, 51, 234, 0.12)',
  };
}

/**
 * Render applications over time chart
 */
function renderTrendChart(trends: DailyTrend[]) {
  const canvas = document.getElementById('trendChart') as HTMLCanvasElement;
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  
  const t = chartTheme();

  trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: trends.map(d => formatDate(d.date)),
      datasets: [
        {
          label: 'Total',
          data: trends.map(d => d.total),
          borderColor: t.totalLine,
          backgroundColor: t.totalFill,
          tension: 0.35,
          fill: true,
          borderWidth: 2.5,
          pointBackgroundColor: t.totalLine,
          pointRadius: 4,
          pointHoverRadius: 6,
        },
        {
          label: 'Submitted',
          data: trends.map(d => d.submitted),
          borderColor: t.submittedLine,
          backgroundColor: t.submittedFill,
          tension: 0.35,
          fill: true,
          borderWidth: 2,
          pointBackgroundColor: t.submittedLine,
          pointRadius: 3,
        },
        {
          label: 'Interviewing',
          data: trends.map(d => d.interviewing),
          borderColor: t.interviewingLine,
          backgroundColor: t.interviewingFill,
          tension: 0.35,
          fill: true,
          borderWidth: 2,
          pointBackgroundColor: t.interviewingLine,
          pointRadius: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            color: t.legendColor,
            font: { family: "'Hind Vadodara', sans-serif", size: 12, weight: 'bold' },
            padding: 14,
            usePointStyle: true,
          },
        },
      },
      scales: {
        x: {
          ticks: { color: t.tickColor, font: { family: "'Hind Vadodara', sans-serif" } },
          grid: { color: t.gridColor },
        },
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1, color: t.tickColor, font: { family: "'Hind Vadodara', sans-serif" } },
          grid: { color: t.gridColor },
        },
      },
    },
  });
}

/**
 * Render status distribution chart
 */
function renderStatusChart() {
  const canvas = document.getElementById('statusChart') as HTMLCanvasElement;
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const t = chartTheme();
  const dark = isDarkMode();
  
  const submitted = allApplications.filter(a => a.status === 'submitted').length;
  const interviewing = allApplications.filter(a => a.status === 'interviewing').length;
  const rejected = allApplications.filter(a => a.status === 'rejected').length;
  const accepted = allApplications.filter(a => a.status === 'accepted').length;
  const withdrawn = allApplications.filter(a => a.status === 'withdrawn').length;
  
  statusChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Submitted', 'Interviewing', 'Rejected', 'Accepted', 'Withdrawn'],
      datasets: [{
        data: [submitted, interviewing, rejected, accepted, withdrawn],
        backgroundColor: [
          dark ? '#fbbf24' : '#d97706', // Submitted (Warm Amber)
          dark ? '#c084fc' : '#9333ea', // Interviewing (Royal Violet)
          dark ? '#f87171' : '#dc2626', // Rejected (Crimson Coral)
          dark ? '#4ade80' : '#16a34a', // Accepted (Vibrant Emerald)
          dark ? '#94a3b8' : '#64748b', // Withdrawn (Slate Gray)
        ],
        borderColor: dark ? '#1b1f14' : '#e7ebe0',
        borderWidth: 3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            color: t.legendColor,
            font: { family: "'Hind Vadodara', sans-serif", size: 12, weight: 'bold' },
            padding: 16,
            usePointStyle: true,
            pointStyle: 'circle',
          },
        },
        tooltip: {
          callbacks: {
            label: (context: any) => {
              const label = context.label || '';
              const value = context.parsed || 0;
              const total = allApplications.length;
              const pct = total > 0 ? Math.round((value / total) * 100) : 0;
              return ` ${label}: ${value} (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

/**
 * Handle CSV export
 */
function handleExport() {
  try {
    const csv = generateCSV(filteredApplications);
    downloadCSV(csv, `job-applications-${new Date().toISOString().split('T')[0]}.csv`);
  } catch (err) {
    console.error('Failed to export CSV:', err);
    alert('Failed to export applications. Check console for details.');
  }
}

/**
 * Generate CSV from applications
 */
function generateCSV(apps: JobApplication[]): string {
  const headers = ['Date', 'Time', 'Job Title', 'Company', 'Status', 'ATS', 'Notes', 'URL'];
  const rows = apps.map(app => {
    const date = new Date(app.timestamp);
    return [
      date.toISOString().split('T')[0],
      date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      app.jobTitle,
      app.company,
      app.status,
      app.atsHint || '',
      app.notes || '',
      app.url,
    ].map(escapeCSV);
  });
  
  return [
    headers.join(','),
    ...rows.map(row => row.join(',')),
  ].join('\n');
}

/**
 * Download CSV file
 */
function downloadCSV(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Handle CSV or JSON application import
 */
async function handleImport(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input?.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    let importedApps: JobApplication[] = [];

    if (file.name.endsWith('.json') || text.trim().startsWith('{') || text.trim().startsWith('[')) {
      importedApps = parseApplicationsJSON(text);
    } else {
      importedApps = parseApplicationsCSV(text);
    }

    if (importedApps.length === 0) {
      alert('No valid applications found in the selected file.');
      return;
    }

    // Group applications by YYYY-MM-DD date key
    const appsByDate: Record<string, JobApplication[]> = {};
    for (const app of importedApps) {
      const dateKey = new Date(app.timestamp).toISOString().split('T')[0];
      if (!appsByDate[dateKey]) {
        appsByDate[dateKey] = [];
      }
      appsByDate[dateKey].push(app);
    }

    // Read existing data for all target date keys
    const targetKeys = Object.keys(appsByDate).map(d => `dailySummary_${d}`);
    const existingData = await browser.storage.local.get(targetKeys);

    const storageUpdates: Record<string, any> = {};
    for (const [dateStr, newApps] of Object.entries(appsByDate)) {
      const key = `dailySummary_${dateStr}`;
      const summary = existingData[key] || {
        date: dateStr,
        applications: [],
        lastSentAt: null,
      };

      const existingList: JobApplication[] = Array.isArray(summary.applications) ? summary.applications : [];
      for (const newApp of newApps) {
        const isDuplicate = existingList.some(
          a => (a.id && a.id === newApp.id) || (a.url === newApp.url && a.jobTitle === newApp.jobTitle)
        );
        if (!isDuplicate) {
          existingList.push(newApp);
        }
      }
      summary.applications = existingList;
      storageUpdates[key] = summary;
    }

    await browser.storage.local.set(storageUpdates);
    alert(`Successfully imported ${importedApps.length} application(s).`);

    // Reload and refresh dashboard view
    await loadDashboardData();
  } catch (err) {
    console.error('Failed to import applications:', err);
    alert('Failed to import applications: ' + (err instanceof Error ? err.message : String(err)));
  } finally {
    if (input) input.value = '';
  }
}

/**
 * Standard CSV parser handling quotes and escaped commas
 */
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (insideQuotes) {
      if (char === '"' && nextChar === '"') {
        currentCell += '"';
        i++;
      } else if (char === '"') {
        insideQuotes = false;
      } else {
        currentCell += char;
      }
    } else {
      if (char === '"') {
        insideQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentCell.trim());
        currentCell = '';
      } else if (char === '\r') {
        // skip carriage return
      } else if (char === '\n') {
        currentRow.push(currentCell.trim());
        if (currentRow.some(c => c.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentCell = '';
      } else {
        currentCell += char;
      }
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some(c => c.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Parse JobApplication items from CSV rows
 */
function parseApplicationsCSV(text: string): JobApplication[] {
  const rows = parseCSV(text);
  if (rows.length < 2) return [];

  const headers = rows[0].map(h => h.trim().toLowerCase());
  const dateIdx = headers.indexOf('date');
  const timeIdx = headers.indexOf('time');
  const titleIdx = headers.findIndex(h => h.includes('title') || h.includes('position') || h.includes('role'));
  const companyIdx = headers.findIndex(h => h.includes('company') || h.includes('organization'));
  const statusIdx = headers.indexOf('status');
  const atsIdx = headers.indexOf('ats');
  const notesIdx = headers.indexOf('notes');
  const urlIdx = headers.findIndex(h => h.includes('url') || h.includes('link'));

  const validStatuses = new Set(['detected', 'submitted', 'interviewing', 'rejected', 'accepted', 'withdrawn']);
  const apps: JobApplication[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const dateStr = dateIdx >= 0 ? row[dateIdx] : '';
    const timeStr = timeIdx >= 0 ? row[timeIdx] : '';
    const jobTitle = titleIdx >= 0 ? row[titleIdx] : '';
    const company = companyIdx >= 0 ? row[companyIdx] : '';
    const rawStatus = (statusIdx >= 0 ? row[statusIdx] : '').toLowerCase();
    const atsHint = atsIdx >= 0 ? row[atsIdx] : null;
    const notes = notesIdx >= 0 ? row[notesIdx] : '';
    const url = urlIdx >= 0 ? row[urlIdx] : '';

    if (!jobTitle && !company && !url) continue;

    let timestamp = Date.now();
    if (dateStr) {
      const parsed = Date.parse(dateStr + (timeStr ? ` ${timeStr}` : ' 12:00:00'));
      if (!isNaN(parsed)) {
        timestamp = parsed;
      }
    }

    const status = validStatuses.has(rawStatus) ? (rawStatus as JobApplication['status']) : 'submitted';

    apps.push({
      id: `app_${timestamp}_${Math.random().toString(36).slice(2, 8)}`,
      jobTitle: jobTitle || 'Application',
      company: company || 'Company',
      url: url || 'https://example.com',
      atsHint: atsHint || null,
      timestamp,
      status,
      notes: notes || '',
    });
  }

  return apps;
}

/**
 * Parse JobApplication items from JSON text
 */
function parseApplicationsJSON(text: string): JobApplication[] {
  const parsed = JSON.parse(text);
  const rawList: any[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.applications)
    ? parsed.applications
    : Array.isArray(parsed.data)
    ? parsed.data
    : [];

  const validStatuses = new Set(['detected', 'submitted', 'interviewing', 'rejected', 'accepted', 'withdrawn']);
  const apps: JobApplication[] = [];

  for (const item of rawList) {
    if (!item || typeof item !== 'object') continue;
    const timestamp = typeof item.timestamp === 'number' ? item.timestamp : Date.now();
    const rawStatus = String(item.status || '').toLowerCase();
    const status = validStatuses.has(rawStatus) ? (rawStatus as JobApplication['status']) : 'submitted';

    apps.push({
      id: item.id || `app_${timestamp}_${Math.random().toString(36).slice(2, 8)}`,
      jobTitle: String(item.jobTitle || item.title || 'Application'),
      company: String(item.company || 'Company'),
      url: String(item.url || 'https://example.com'),
      atsHint: item.atsHint || null,
      timestamp,
      status,
      notes: item.notes || '',
    });
  }

  return apps;
}

/**
 * Utility: Set element text content
 */
function setElementText(id: string, text: string) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = text;
  }
}

/**
 * Utility: Format date (YYYY-MM-DD to readable format)
 */
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Utility: Escape HTML
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Utility: Escape CSV field
 */
function escapeCSV(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

/**
 * Show error message
 */
function showError(message: string) {
  const container = document.getElementById('kanbanContent');
  if (container) {
    setHTML(container, `
      <div class="empty-state">
        <h3>Error</h3>
        <p>${escapeHtml(message)}</p>
      </div>
    `);
  }
}

/**
 * Execute clearing all application tracking data after user confirms in modal
 */
async function executeClearAllData() {
  const confirmBtn = document.getElementById('confirmClearDataBtn') as HTMLButtonElement | null;
  const clearModal = document.getElementById('clearDataModal');
  
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Clearing...';
  }

  try {
    console.log('[Dashboard] Clearing all application data...');

    // Collect dailySummary keys for past 365 days plus any specific dates in memory
    const keysSet = new Set<string>();
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - i);
      keysSet.add(`dailySummary_${d.toISOString().split('T')[0]}`);
    }
    for (const app of allApplications) {
      if (app.timestamp) {
        const appDate = new Date(app.timestamp).toISOString().split('T')[0];
        keysSet.add(`dailySummary_${appDate}`);
      }
    }

    const keysToRemove = Array.from(keysSet);
    await browser.storage.local.remove(keysToRemove);
    console.log('[Dashboard] Cleared', keysToRemove.length, 'daily summary keys');

    allApplications = [];
    filteredApplications = [];

    clearModal?.classList.remove('active');
    await renderDashboard();
  } catch (err) {
    console.error('[Dashboard] Failed to clear data:', err);
    showError('Failed to clear application data');
  } finally {
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Yes, Delete All Data';
    }
  }
}

// Re-render charts when dark/light mode is toggled so colours update live
new MutationObserver(() => {
  renderCharts();
}).observe(document.documentElement, { attributeFilter: ['class'] });

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
