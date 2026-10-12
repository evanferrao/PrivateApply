import browser from '../shared/browser-compat';
import {
  type ProfileMeta,
  type UserProfile,
  getProfilesIndex,
  listProfiles,
  createProfile,
  deleteProfile,
  setActiveProfile,
  updateProfileMeta,
  migrateToMultiProfile,
  getProfileById,
  saveProfileById,
  getUserProfile,
  saveUserProfile,
  formatPhone,
  formatLocation,
  isPhoneDetails,
  type PhoneDetails,
} from '../shared/profile';
import {
  calculateDerivedExperience,
  createDefaultIndiaPack,
  createDefaultCustomField,
  createDefaultWorkPreferences,
  createDefaultLegalAndDisclosures,
  createDefaultQuestionBank,
  type EducationRecord,
  type CertificationRecord,
  type DetailedEmploymentRecord,
  type FamilyContact,
  type CustomFieldDefinition,
  type QuestionBankItem,
  type WorkPreferences,
  type LegalAndDisclosures,
} from '../shared/applicant-profile';
import { setHTML } from '../shared/html';
import { getActivePacks, type CountryPack } from '../shared/country-packs';
import { getActivePacks as getActiveEmploymentPacks, type EmploymentPack } from '../shared/employment-packs';
import {
  getGistSyncConfig,
  pushToGist,
  pullFromGist,
  triggerAutoGistSyncIfEnabled,
  type ModifiedFieldNotice,
} from '../shared/gist-sync';

const COLORS = [
  '#7c3aed', '#2563eb', '#059669', '#d97706',
  '#dc2626', '#8b5cf6', '#0891b2', '#be185d',
];

let allProfiles: ProfileMeta[] = [];
let activeId = 'default';
let activeProfileData: UserProfile | null = null;

function escapeHtml(s: string): string {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

function getVal(id: string): string {
  return ((document.getElementById(id) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)?.value || '').trim();
}

function getOptVal(id: string): string | undefined {
  return getVal(id) || undefined;
}

function setVal(id: string, val: string | number | undefined | null): void {
  const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
  if (el) el.value = val !== undefined && val !== null ? String(val) : '';
}

function getChecked(id: string, def = false): boolean {
  const el = document.getElementById(id) as HTMLInputElement | null;
  return el ? el.checked : def;
}

function setChecked(id: string, checked: boolean | undefined | null, def = false): void {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (el) el.checked = checked !== undefined && checked !== null ? Boolean(checked) : def;
}

function parsePhoneComponents(phone: string | PhoneDetails | undefined): { countryCode: string; number: string } {
  if (!phone) return { countryCode: '+1', number: '' };
  if (isPhoneDetails(phone)) {
    return { countryCode: phone.countryCode || '+1', number: phone.number || '' };
  }
  const str = String(phone).trim();
  const match = str.match(/^(\+\d{1,4})\s*(.*)$/);
  if (match) {
    return { countryCode: match[1], number: match[2].trim() };
  }
  return { countryCode: '+1', number: str };
}

function formatStartDaysText(days: number): string {
  if (days <= 0) return '(Immediate — ready to start now)';
  const target = new Date();
  target.setDate(target.getDate() + days);
  const dateStr = target.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  if (days === 7) return `(1 week notice — joining ~${dateStr})`;
  if (days === 14) return `(2 weeks notice — joining ~${dateStr})`;
  if (days === 30) return `(1 month notice — joining ~${dateStr})`;
  if (days === 60) return `(2 months notice — joining ~${dateStr})`;
  if (days === 90) return `(3 months notice — joining ~${dateStr})`;
  return `(${days} days — joining ~${dateStr})`;
}

function updateStartDaysDisplay(days: number): void {
  const calcEl = document.getElementById('wp-earliest-start-calc');
  if (calcEl) calcEl.textContent = formatStartDaysText(days);

  document.querySelectorAll<HTMLButtonElement>('.btn-preset-day').forEach(btn => {
    const d = parseInt(btn.dataset.days || '-1', 10);
    if (d === days) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

function setupStartDaysEvents(): void {
  const input = document.getElementById('wp-earliest-start-days') as HTMLInputElement | null;
  input?.addEventListener('input', () => {
    const val = parseInt(input.value, 10);
    updateStartDaysDisplay(isNaN(val) ? 0 : val);
  });

  document.querySelectorAll<HTMLButtonElement>('.btn-preset-day').forEach(btn => {
    btn.addEventListener('click', () => {
      const days = parseInt(btn.dataset.days || '0', 10);
      if (input) {
        input.value = String(days);
      }
      updateStartDaysDisplay(days);
    });
  });
}

function showToast(message: string): void {
  const toast = document.getElementById('toast');
  if (toast) {
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
  }
}

function initials(name: string): string {
  return (name || 'U')
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('');
}

// ── Tab Navigation ─────────────────────────────────────────────────────────

function setupTabs(): void {
  const tabButtons = document.querySelectorAll('.hub-tab-btn');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = (btn as HTMLElement).dataset.tab;
      if (!targetId) return;

      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      document.getElementById(targetId)?.classList.add('active');
    });
  });
}

// ── Load & Render Data ─────────────────────────────────────────────────────

async function init(): Promise<void> {
  await migrateToMultiProfile();
  const index = await getProfilesIndex();
  activeId = index?.activeId ?? 'default';
  allProfiles = await listProfiles();

  activeProfileData = await getUserProfile();
  if (!activeProfileData) {
    activeProfileData = {
      personal: { firstName: '', lastName: '', email: '', phone: '', location: '' },
      professional: {},
      work: [],
      education: [],
      skills: [],
      lastUpdated: Date.now(),
    };
  }

  if (!activeProfileData.workPreferences) {
    activeProfileData.workPreferences = createDefaultWorkPreferences();
  }
  if (!activeProfileData.legalDisclosures) {
    activeProfileData.legalDisclosures = createDefaultLegalAndDisclosures();
  }
  if (!activeProfileData.questionBank || activeProfileData.questionBank.length === 0) {
    activeProfileData.questionBank = createDefaultQuestionBank();
    await saveUserProfile(activeProfileData);
  }

  renderActiveBanner();
  populatePersonalForm();
  populateEducationList();
  populateCertificationsList();
  populateExperienceList();
  populateWorkPreferencesForm();
  populateScreeningForm();
  populateFamilyList();
  populateCountryPacksHub();
  populateEmploymentPacksHub();
  populateCustomFieldsList();
  populateQuestionBankList();
  renderProfilesGrid();
  await renderGistHubCard();
  setupCustomFieldBuilderEvents();
  setupActionButtons();
}

function renderActiveBanner(): void {
  const banner = document.getElementById('active-banner')!;
  const active = allProfiles.find(p => p.id === activeId);
  if (!active) {
    banner.style.display = 'none';
    return;
  }
  banner.style.display = 'flex';
  const dot = document.getElementById('active-dot')!;
  dot.style.background = active.color;
  dot.textContent = initials(active.name);
  setHTML(document.getElementById('active-name')!, escapeHtml(active.name));
  setHTML(
    document.getElementById('active-role')!,
    active.targetRole ? escapeHtml(active.targetRole) : 'No target role set'
  );
}

// ── Personal Form ──────────────────────────────────────────────────────────

function populatePersonalForm(): void {
  if (!activeProfileData) return;
  const p = activeProfileData.personal;
  const prof = activeProfileData.professional;

  setVal('core-first-name', p.firstName);
  setVal('core-middle-name', p.middleName);
  setVal('core-last-name', p.lastName);
  setVal('core-full-name', p.fullName);
  setVal('core-preferred-name', p.preferredName);
  setVal('core-email', p.email);

  // Phone - split country code and national number
  const parsedPhone = parsePhoneComponents(p.phone);
  setVal('core-phone-cc', parsedPhone.countryCode);
  setVal('core-phone-num', parsedPhone.number);
  setVal('core-phone', formatPhone(p.phone) || '');

  // Alternate phone
  const parsedAltPhone = parsePhoneComponents(p.alternatePhone);
  setVal('core-alt-phone-cc', parsedAltPhone.countryCode);
  setVal('core-alt-phone-num', parsedAltPhone.number);
  setVal('core-alternate-phone', formatPhone(p.alternatePhone || '') || '');

  setVal('core-univ-email', p.universityEmail);
  setVal('core-address', formatLocation(p.location) || '');
  setVal('core-permanent-address', formatLocation(p.permanentAddress || '') || '');
  setVal('core-nationality', p.nationality || p.citizenship || '');

  setVal('core-linkedin', prof?.linkedin);
  setVal('core-github', prof?.github);
  setVal('core-portfolio', prof?.portfolio || prof?.website);

  // Social Links
  setVal('core-twitter', prof?.twitter);
  setVal('core-youtube', prof?.youtube);
  setVal('core-instagram', prof?.instagram);
  setVal('core-facebook', prof?.facebook);
  setVal('core-threads', prof?.threads);
  setVal('core-bluesky', prof?.bluesky);
  setVal('core-medium', prof?.medium);

  // Passport (Protected Field)
  const pass = activeProfileData.passport;
  setVal('core-passport-num', pass?.passportNumber);
  setVal('core-passport-country', pass?.issuingCountry);
  setVal('core-passport-expiry', pass?.expiryDate);
  setVal('core-passport-issue-date', pass?.issueDate);
  setVal('core-passport-nationality', pass?.nationality || p.nationality || p.citizenship);
}

function syncPassportFromDom(): void {
  if (!activeProfileData) return;
  const passNum = getVal('core-passport-num');
  const passCountry = getVal('core-passport-country');
  const passExpiry = getOptVal('core-passport-expiry');
  const passIssue = getOptVal('core-passport-issue-date');
  const passNat = getOptVal('core-passport-nationality');

  if (passNum || passCountry || passExpiry || passIssue || passNat) {
    activeProfileData.passport = {
      passportNumber: passNum,
      issuingCountry: passCountry,
      expiryDate: passExpiry,
      issueDate: passIssue,
      nationality: passNat,
    };
  } else {
    activeProfileData.passport = undefined;
  }
}

async function savePersonal(): Promise<void> {
  if (!activeProfileData) return;
  const p = activeProfileData.personal;
  p.firstName = getVal('core-first-name');
  p.middleName = getOptVal('core-middle-name');
  p.lastName = getVal('core-last-name');
  p.fullName = getOptVal('core-full-name');
  p.preferredName = getOptVal('core-preferred-name');
  p.email = getVal('core-email');

  // Save phone as structured PhoneDetails
  const phoneCc = getVal('core-phone-cc') || '+1';
  const phoneNum = getVal('core-phone-num');
  const normalizedCc = phoneCc.startsWith('+') ? phoneCc : `+${phoneCc}`;
  p.phone = phoneNum ? { countryCode: normalizedCc, number: phoneNum, formatted: `${normalizedCc} ${phoneNum}` } : '';

  // Save alternate phone
  const altCc = getVal('core-alt-phone-cc') || '+1';
  const altNum = getVal('core-alt-phone-num');
  const normalizedAltCc = altCc.startsWith('+') ? altCc : `+${altCc}`;
  p.alternatePhone = altNum ? { countryCode: normalizedAltCc, number: altNum, formatted: `${normalizedAltCc} ${altNum}` } : undefined;

  p.universityEmail = getOptVal('core-univ-email');
  p.location = getVal('core-address');
  p.permanentAddress = getOptVal('core-permanent-address');
  p.nationality = getOptVal('core-nationality');

  syncPassportFromDom();

  await saveUserProfile(activeProfileData);
  showToast('✓ Personal details saved');
}

async function savePassport(): Promise<void> {
  if (!activeProfileData) return;
  syncPassportFromDom();
  await saveUserProfile(activeProfileData);
  showToast('✓ Passport details saved (Protected)');
}

async function saveLinks(): Promise<void> {
  if (!activeProfileData) return;
  if (!activeProfileData.professional) activeProfileData.professional = {};
  const prof = activeProfileData.professional;
  prof.linkedin = getOptVal('core-linkedin');
  prof.github = getOptVal('core-github');
  prof.portfolio = getOptVal('core-portfolio');
  prof.twitter = getOptVal('core-twitter');
  prof.youtube = getOptVal('core-youtube');
  prof.instagram = getOptVal('core-instagram');
  prof.facebook = getOptVal('core-facebook');
  prof.threads = getOptVal('core-threads');
  prof.bluesky = getOptVal('core-bluesky');
  prof.medium = getOptVal('core-medium');

  await saveUserProfile(activeProfileData);
  showToast('✓ Professional and social links saved');
}

// ── Education History ──────────────────────────────────────────────────────

function populateEducationList(): void {
  const container = document.getElementById('education-records-container')!;
  const records = activeProfileData?.educationHistory || [];

  if (records.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 28px; color: var(--gray-600); font-size: 13.5px;">
        No education records added yet. Click "+ Add Education Record" to add Class 10, Class 12, or degree qualifications.
      </div>
    `;
    return;
  }

  let html = '';
  records.forEach((r, idx) => {
    const levelLabel =
      r.level === 'class_10'
        ? 'Class 10 / Secondary'
        : r.level === 'class_12'
        ? 'Class 12 / Higher Secondary'
        : r.level === 'diploma'
        ? 'Diploma'
        : r.level === 'undergraduate'
        ? 'Undergraduate Degree'
        : r.level === 'postgraduate'
        ? "Master's Degree"
        : r.level === 'doctoral'
        ? 'PhD / Doctorate'
        : 'Qualification';

    html += `
      <div class="record-item">
        <div class="record-details">
          <div class="record-title">${escapeHtml(r.qualificationTitle || levelLabel)}</div>
          <div class="record-subtitle">${escapeHtml(r.schoolOrInstitution)} ${r.boardOrUniversity ? `· ${escapeHtml(r.boardOrUniversity)}` : ''}</div>
          <div class="record-tags">
            <span class="record-tag">${escapeHtml(levelLabel)}</span>
            ${r.scoreValue ? `<span class="record-tag">Score: ${escapeHtml(String(r.scoreValue))}${r.scoreType === 'percentage' ? '%' : ''}</span>` : ''}
            ${r.yearOfPassing ? `<span class="record-tag">Year: ${escapeHtml(r.yearOfPassing)}</span>` : ''}
            ${r.streamOrMajor ? `<span class="record-tag">Major: ${escapeHtml(r.streamOrMajor)}</span>` : ''}
            ${r.studentIdOrRollNo ? `<span class="record-tag">Roll: ${escapeHtml(r.studentIdOrRollNo)}</span>` : ''}
          </div>
        </div>
        <button type="button" class="btn-action-danger btn-del-edu" data-idx="${idx}">Delete</button>
      </div>
    `;
  });

  setHTML(container, html);

  container.querySelectorAll('.btn-del-edu').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt((btn as HTMLElement).dataset.idx!, 10);
      activeProfileData?.educationHistory?.splice(idx, 1);
      await saveUserProfile(activeProfileData!);
      populateEducationList();
      showToast('✓ Education record deleted');
    });
  });
}

function openEducationModal(): void {
  const modal = document.getElementById('edu-modal');
  if (!modal) return;
  setVal('edu-modal-title-input', '');
  setVal('edu-modal-school', '');
  setVal('edu-modal-score', '');
  setVal('edu-modal-year', '');
  setVal('edu-modal-level', 'undergraduate');
  modal.classList.add('active');
}

function closeEducationModal(): void {
  document.getElementById('edu-modal')?.classList.remove('active');
}

function setupEducationModalEvents(): void {
  const modal = document.getElementById('edu-modal');
  const form = document.getElementById('edu-modal-form') as HTMLFormElement | null;
  const cancelBtn = document.getElementById('edu-modal-cancel');

  cancelBtn?.addEventListener('click', closeEducationModal);
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeEducationModal();
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!activeProfileData) return;
    if (!activeProfileData.educationHistory) activeProfileData.educationHistory = [];

    const rec: EducationRecord = {
      id: `edu_${Date.now()}`,
      level: getVal('edu-modal-level') as any,
      qualificationTitle: getVal('edu-modal-title-input'),
      schoolOrInstitution: getVal('edu-modal-school'),
      scoreValue: getVal('edu-modal-score'),
      yearOfPassing: getVal('edu-modal-year'),
      resultStatus: 'passed',
    };

    activeProfileData.educationHistory.push(rec);
    await saveUserProfile(activeProfileData);
    closeEducationModal();
    populateEducationList();
    showToast('✓ Education record added');
  });
}

// ── Certifications & Licenses ─────────────────────────────────────────────

let currentCertModalAliases: string[] = [];

function renderCertModalAliases(): void {
  const container = document.getElementById('cert-modal-aliases-container');
  if (!container) return;
  if (currentCertModalAliases.length === 0) {
    container.innerHTML = '<span style="font-size:12px;color:var(--text-muted);font-style:italic;">No aliases added yet.</span>';
    return;
  }
  container.innerHTML = currentCertModalAliases
    .map(
      (alias, idx) =>
        `<span class="alias-pill">${escapeHtml(alias)} <button type="button" class="alias-pill-remove" data-del-alias="${idx}" title="Remove alias">&times;</button></span>`
    )
    .join(' ');

  container.querySelectorAll('.alias-pill-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt((btn as HTMLElement).dataset.delAlias || '0', 10);
      currentCertModalAliases.splice(idx, 1);
      renderCertModalAliases();
    });
  });
}

function addCertAliasFromInput(): void {
  const input = document.getElementById('cert-modal-aliases-input') as HTMLInputElement | null;
  if (!input) return;
  const val = input.value.trim();
  if (!val) return;
  const parts = val.split(',').map(s => s.trim()).filter(Boolean);
  for (const p of parts) {
    if (!currentCertModalAliases.some(a => a.toLowerCase() === p.toLowerCase())) {
      currentCertModalAliases.push(p);
    }
  }
  input.value = '';
  renderCertModalAliases();
  input.focus();
}

function populateCertificationsList(): void {
  const container = document.getElementById('certifications-records-container');
  if (!container) return;
  const records = activeProfileData?.certifications || [];

  if (records.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 28px; color: var(--text-muted); font-size: 13.5px;">
        No certifications added yet. Click "+ Add Certification" to record professional certifications, licenses, and verified credentials with organization aliases.
      </div>
    `;
    return;
  }

  let html = '';
  records.forEach((cert) => {
    const aliasesHtml =
      cert.issuerAliases && cert.issuerAliases.length > 0
        ? `<div style="margin-top:6px; display:flex; flex-wrap:wrap; gap:4px; align-items:center;">
             <span style="font-size:11.5px;color:var(--text-muted);font-weight:600;">Aliases:</span>
             ${cert.issuerAliases.map(a => `<span class="alias-pill">${escapeHtml(a)}</span>`).join('')}
           </div>`
        : '';

    const tags: string[] = [];
    if (cert.examCode) tags.push(`<span class="record-tag">Exam: ${escapeHtml(cert.examCode)}</span>`);
    if (cert.credentialId) tags.push(`<span class="record-tag">ID: ${escapeHtml(cert.credentialId)}</span>`);
    if (cert.scoreOrGrade) tags.push(`<span class="record-tag">Score: ${escapeHtml(cert.scoreOrGrade)}</span>`);
    if (cert.issueDate) tags.push(`<span class="record-tag">Issued: ${escapeHtml(cert.issueDate)}</span>`);
    if (cert.doesNotExpire) {
      tags.push(`<span class="record-tag" style="background:var(--success-100, #dcfce7);color:var(--success-800, #15803d);font-weight:600;">Lifetime Valid</span>`);
    } else if (cert.expiryDate) {
      tags.push(`<span class="record-tag">Expires: ${escapeHtml(cert.expiryDate)}</span>`);
    }
    if (cert.skillsCovered && cert.skillsCovered.length > 0) {
      tags.push(`<span class="record-tag">Skills: ${escapeHtml(cert.skillsCovered.join(', '))}</span>`);
    }

    const verifyHtml = cert.verificationUrl
      ? `<div style="margin-top:6px; display:flex; align-items:center; gap:8px;">
           <a href="${escapeHtml(cert.verificationUrl)}" target="_blank" rel="noopener noreferrer" style="font-size:12px; color:var(--primary-600); text-decoration:none; display:inline-flex; align-items:center; gap:4px; font-weight:500;">
             <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
             Verify Credential
           </a>
           <button type="button" class="btn-copy-cert-link" data-url="${escapeHtml(cert.verificationUrl)}" style="background:none; border:none; cursor:pointer; font-size:11.5px; color:var(--text-muted); padding:0 4px; text-decoration:underline;">Copy URL</button>
         </div>`
      : '';

    html += `
      <div class="record-item">
        <div class="record-details">
          <div class="record-title">${escapeHtml(cert.name)}</div>
          <div class="record-subtitle">Issued by <strong>${escapeHtml(cert.issuer)}</strong></div>
          ${aliasesHtml}
          ${verifyHtml}
          <div class="record-tags" style="margin-top:8px;">
            ${tags.join('')}
          </div>
        </div>
        <div class="record-actions" style="display:flex; gap:6px;">
          <button type="button" class="btn-edit-record" data-edit-cert="${escapeHtml(cert.id)}" style="background:none;border:none;cursor:pointer;color:var(--primary-600);font-size:12.5px;font-weight:600;">Edit</button>
          <button type="button" class="btn-delete-record" data-delete-cert="${escapeHtml(cert.id)}" style="background:none;border:none;cursor:pointer;color:var(--danger-600, #dc2626);font-size:12.5px;font-weight:600;">Delete</button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;

  container.querySelectorAll('[data-edit-cert]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = (btn as HTMLElement).dataset.editCert;
      openCertificationModal(id);
    });
  });

  container.querySelectorAll('[data-delete-cert]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = (btn as HTMLElement).dataset.deleteCert;
      if (!activeProfileData || !id) return;
      if (confirm('Are you sure you want to delete this certification?')) {
        activeProfileData.certifications = (activeProfileData.certifications || []).filter(c => c.id !== id);
        await saveUserProfile(activeProfileData);
        populateCertificationsList();
        showToast('✓ Certification deleted');
      }
    });
  });

  container.querySelectorAll('.btn-copy-cert-link').forEach(btn => {
    btn.addEventListener('click', () => {
      const url = (btn as HTMLElement).dataset.url || '';
      if (url) {
        navigator.clipboard.writeText(url).then(() => {
          showToast('✓ Verification URL copied to clipboard');
        });
      }
    });
  });
}

function openCertificationModal(certId?: string): void {
  const modal = document.getElementById('cert-modal');
  if (!modal) return;
  const titleEl = document.getElementById('cert-modal-title');
  const expiryEl = document.getElementById('cert-modal-expiry-date') as HTMLInputElement | null;

  if (certId && activeProfileData?.certifications) {
    const existing = activeProfileData.certifications.find(c => c.id === certId);
    if (existing) {
      if (titleEl) titleEl.textContent = 'Edit Certification / License';
      setVal('cert-modal-id', existing.id);
      setVal('cert-modal-name', existing.name);
      setVal('cert-modal-issuer', existing.issuer);
      setVal('cert-modal-exam-code', existing.examCode || '');
      setVal('cert-modal-credential-id', existing.credentialId || '');
      setVal('cert-modal-score', existing.scoreOrGrade || '');
      setVal('cert-modal-verification-url', existing.verificationUrl || '');
      setVal('cert-modal-issue-date', existing.issueDate || '');
      setVal('cert-modal-expiry-date', existing.expiryDate || '');
      setChecked('cert-modal-no-expire', Boolean(existing.doesNotExpire));
      if (expiryEl) expiryEl.disabled = Boolean(existing.doesNotExpire);
      setVal('cert-modal-skills', (existing.skillsCovered || []).join(', '));
      currentCertModalAliases = [...(existing.issuerAliases || [])];
      renderCertModalAliases();
      modal.classList.add('active');
      return;
    }
  }

  if (titleEl) titleEl.textContent = 'Add Certification / License';
  setVal('cert-modal-id', '');
  setVal('cert-modal-name', '');
  setVal('cert-modal-issuer', '');
  setVal('cert-modal-exam-code', '');
  setVal('cert-modal-credential-id', '');
  setVal('cert-modal-score', '');
  setVal('cert-modal-verification-url', '');
  setVal('cert-modal-issue-date', '');
  setVal('cert-modal-expiry-date', '');
  if (expiryEl) expiryEl.disabled = false;
  setChecked('cert-modal-no-expire', false);
  setVal('cert-modal-skills', '');
  currentCertModalAliases = [];
  renderCertModalAliases();
  modal.classList.add('active');
}

function closeCertificationModal(): void {
  document.getElementById('cert-modal')?.classList.remove('active');
}

function setupCertificationModalEvents(): void {
  const modal = document.getElementById('cert-modal');
  const form = document.getElementById('cert-modal-form') as HTMLFormElement | null;
  const cancelBtn = document.getElementById('cert-modal-cancel');
  const addAliasBtn = document.getElementById('btn-add-cert-alias');
  const aliasInput = document.getElementById('cert-modal-aliases-input') as HTMLInputElement | null;
  const noExpireCheckbox = document.getElementById('cert-modal-no-expire') as HTMLInputElement | null;
  const expiryInput = document.getElementById('cert-modal-expiry-date') as HTMLInputElement | null;

  cancelBtn?.addEventListener('click', closeCertificationModal);
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeCertificationModal();
  });

  addAliasBtn?.addEventListener('click', addCertAliasFromInput);
  aliasInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCertAliasFromInput();
    }
  });

  noExpireCheckbox?.addEventListener('change', () => {
    if (expiryInput) {
      expiryInput.disabled = Boolean(noExpireCheckbox.checked);
      if (noExpireCheckbox.checked) {
        expiryInput.value = '';
      }
    }
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!activeProfileData) return;
    if (!activeProfileData.certifications) activeProfileData.certifications = [];

    const idInput = getVal('cert-modal-id');
    const doesNotExpire = getChecked('cert-modal-no-expire');
    const rawSkills = getVal('cert-modal-skills');

    if (aliasInput && aliasInput.value.trim()) {
      addCertAliasFromInput();
    }

    const certRecord: CertificationRecord = {
      id: idInput || `cert_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: getVal('cert-modal-name'),
      issuer: getVal('cert-modal-issuer'),
      issuerAliases: [...currentCertModalAliases],
      examCode: getOptVal('cert-modal-exam-code'),
      credentialId: getOptVal('cert-modal-credential-id'),
      verificationUrl: getOptVal('cert-modal-verification-url'),
      issueDate: getVal('cert-modal-issue-date'),
      expiryDate: doesNotExpire ? undefined : getOptVal('cert-modal-expiry-date'),
      doesNotExpire,
      scoreOrGrade: getOptVal('cert-modal-score'),
      skillsCovered: rawSkills ? rawSkills.split(',').map(s => s.trim()).filter(Boolean) : undefined,
    };

    if (idInput) {
      const idx = activeProfileData.certifications.findIndex(c => c.id === idInput);
      if (idx >= 0) {
        activeProfileData.certifications[idx] = certRecord;
      } else {
        activeProfileData.certifications.push(certRecord);
      }
    } else {
      activeProfileData.certifications.push(certRecord);
    }

    await saveUserProfile(activeProfileData);
    closeCertificationModal();
    populateCertificationsList();
    showToast(idInput ? '✓ Certification updated' : '✓ Certification added');
  });
}

// ── Experience & Compensation ──────────────────────────────────────────────

function populateExperienceList(): void {
  if (!activeProfileData) return;
  const prof = activeProfileData.professional;
  const comp = activeProfileData.compensation;

  (document.getElementById('comp-notice-days') as HTMLInputElement).value = String(
    prof?.noticePeriodDays ?? comp?.currentAnnualCtc ?? ''
  );
  (document.getElementById('comp-current-ctc') as HTMLInputElement).value = String(comp?.currentAnnualCtc ?? '');
  (document.getElementById('comp-expected-ctc') as HTMLInputElement).value = String(comp?.expectedAnnualCtc ?? '');
  (document.getElementById('comp-currency') as HTMLSelectElement).value = comp?.currency || 'INR';
  (document.getElementById('comp-negotiable') as HTMLSelectElement).value = comp?.isNegotiable ? 'true' : 'false';
  (document.getElementById('comp-work-pref') as HTMLSelectElement).value = prof?.workPreference || 'remote';

  // Derived stats
  // Auto-migrate activeProfileData.work to employmentHistory if empty
  if (!activeProfileData.employmentHistory || activeProfileData.employmentHistory.length === 0) {
    if (activeProfileData.work && activeProfileData.work.length > 0) {
      activeProfileData.employmentHistory = activeProfileData.work.map((w, idx) => {
        const titleLower = (w.title || '').toLowerCase();
        const companyLower = (w.company || '').toLowerCase();
        const isIntern = titleLower.includes('intern') || titleLower.includes('trainee');
        const isOpenSource = titleLower.includes('maintainer') || companyLower.includes('open source');
        const isSelfEmployed = titleLower.includes('freelance') || titleLower.includes('consultant');

        let type: DetailedEmploymentRecord['employmentType'] = 'full_time';
        let counts = true;
        if (isIntern) {
          type = 'internship';
          counts = false;
        } else if (isOpenSource) {
          type = 'open_source';
          counts = false;
        } else if (isSelfEmployed) {
          type = 'freelance';
        }

        return {
          id: `job_migrated_${idx}_${Date.now()}`,
          employerName: w.company || 'Unknown Employer',
          jobTitle: w.title || 'Role',
          startDate: w.startDate || '',
          endDate: w.endDate || '',
          currentlyEmployed: Boolean(w.current),
          employmentType: type,
          isInternship: isIntern,
          countsTowardsExperience: counts,
        };
      });
      saveUserProfile(activeProfileData).catch(console.error);
    } else {
      activeProfileData.employmentHistory = [];
    }
  }

  const detailedJobs = activeProfileData.employmentHistory || [];
  const derived = calculateDerivedExperience(detailedJobs as any, activeProfileData.experienceOverrides);

  // Sync professional yearsOfExperience with derived
  if (!activeProfileData.professional) activeProfileData.professional = {};
  activeProfileData.professional.yearsOfExperience = derived.totalExperienceYears;

  document.getElementById('stat-total-exp')!.textContent = derived.displayTotalExperience;
  document.getElementById('stat-fulltime-exp')!.textContent = `${derived.fullTimeYears} yrs`;
  document.getElementById('stat-tenure')!.textContent = `${derived.currentEmployerTenureYears} yrs`;
  document.getElementById('stat-employers')!.textContent = String(derived.totalEmployersCount);

  // Update badge and reset button
  const badgeEl = document.getElementById('exp-calc-badge');
  const resetBtn = document.getElementById('btn-reset-exp-stats');
  if (badgeEl && resetBtn) {
    if (derived.isOverridden) {
      badgeEl.textContent = 'Custom Override';
      badgeEl.style.background = '#fef3c7';
      badgeEl.style.color = '#92400e';
      resetBtn.style.display = 'inline-block';
    } else {
      badgeEl.textContent = 'Auto-Calculated';
      badgeEl.style.background = '#e0f2fe';
      badgeEl.style.color = '#0369a1';
      resetBtn.style.display = 'none';
    }
  }

  // Job cards
  const container = document.getElementById('employment-records-container')!;
  if (detailedJobs.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 28px; color: var(--gray-600); font-size: 13.5px;">
        No employment or internship records added yet. Click "+ Add Job" or "+ Add Internship" to add history.
      </div>
    `;
    return;
  }

  let html = '';
  detailedJobs.forEach((job, idx) => {
    const isIntern = job.employmentType === 'internship' || Boolean(job.isInternship);
    const isOpenSource = job.employmentType === 'open_source';
    const countsExp = job.countsTowardsExperience !== false;

    html += `
      <div class="record-item">
        <div class="record-details">
          <div class="record-title">${escapeHtml(job.jobTitle)} at ${escapeHtml(job.employerName)}</div>
          <div class="record-subtitle">${escapeHtml(job.startDate)} — ${job.currentlyEmployed ? 'Present' : escapeHtml(job.endDate || '')}</div>
          <div class="record-tags">
            <span class="record-tag" style="${isIntern ? 'background:#fef3c7;color:#92400e;' : isOpenSource ? 'background:#ede9fe;color:#5b21b6;' : ''}">${job.employmentType.replace('_', ' ')}</span>
            ${countsExp ? '<span class="record-tag" style="background:#dcfce7;color:#15803d;">Counts toward Exp</span>' : '<span class="record-tag" style="background:#f1f5f9;color:#475569;">Excluded from Work Exp</span>'}
            ${job.noticePeriodDays ? `<span class="record-tag">Notice: ${job.noticePeriodDays} days</span>` : ''}
            ${job.currentlyEmployed ? '<span class="record-tag" style="background:#dcfce7;color:#15803d;">Current</span>' : ''}
          </div>
        </div>
        <div style="display:flex; gap:8px;">
          <button type="button" class="btn-action-secondary btn-edit-job" data-idx="${idx}" style="font-size:12px; padding:4px 10px;">Edit</button>
          <button type="button" class="btn-action-danger btn-del-job" data-idx="${idx}">Delete</button>
        </div>
      </div>
    `;
  });

  setHTML(container, html);

  container.querySelectorAll('.btn-edit-job').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt((btn as HTMLElement).dataset.idx!, 10);
      openJobModal(idx);
    });
  });

  container.querySelectorAll('.btn-del-job').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt((btn as HTMLElement).dataset.idx!, 10);
      activeProfileData?.employmentHistory?.splice(idx, 1);
      if (activeProfileData?.work && activeProfileData.work.length > idx) {
        activeProfileData.work.splice(idx, 1);
      }
      await saveUserProfile(activeProfileData!);
      populateExperienceList();
      showToast('✓ Record deleted');
    });
  });
}

async function saveCompensation(): Promise<void> {
  if (!activeProfileData) return;
  if (!activeProfileData.compensation) {
    activeProfileData.compensation = {
      currency: 'INR',
      salaryPeriod: 'annual',
      isNegotiable: true,
    };
  }

  const notice = parseInt(getVal('comp-notice-days'), 10);
  const currentCtc = parseFloat(getVal('comp-current-ctc'));
  const expCtc = parseFloat(getVal('comp-expected-ctc'));
  const curr = getVal('comp-currency');
  const neg = getVal('comp-negotiable') === 'true';
  const pref = getVal('comp-work-pref') as any;

  if (!activeProfileData.professional) activeProfileData.professional = {};
  if (!isNaN(notice)) {
    activeProfileData.professional.noticePeriodDays = notice;
    activeProfileData.professional.noticePeriod = `${notice} days`;
  }
  activeProfileData.professional.workPreference = pref;

  activeProfileData.compensation.currentAnnualCtc = isNaN(currentCtc) ? undefined : currentCtc;
  activeProfileData.compensation.expectedAnnualCtc = isNaN(expCtc) ? undefined : expCtc;
  activeProfileData.compensation.currency = curr;
  activeProfileData.compensation.isNegotiable = neg;

  await saveUserProfile(activeProfileData);
  showToast('✓ Compensation & notice period saved');
}

function openJobModal(idx?: number, defaultType: string = 'full_time'): void {
  const modal = document.getElementById('job-modal');
  const titleEl = document.getElementById('job-modal-title');
  if (!modal) return;

  if (idx !== undefined && idx >= 0 && activeProfileData?.employmentHistory?.[idx]) {
    const job = activeProfileData.employmentHistory[idx];
    if (titleEl) titleEl.textContent = 'Edit Record';
    setVal('job-edit-idx', idx);
    setVal('job-type', job.employmentType || 'full_time');
    setVal('job-company', job.employerName || '');
    setVal('job-title', job.jobTitle || '');
    setVal('job-start', job.startDate || '');
    setVal('job-end', job.endDate || '');
    setChecked('job-current', Boolean(job.currentlyEmployed));
    setChecked('job-counts-exp', job.countsTowardsExperience !== false);
  } else {
    if (titleEl) titleEl.textContent = defaultType === 'internship' ? 'Add Internship' : 'Add Employment';
    setVal('job-edit-idx', '-1');
    setVal('job-type', defaultType);
    setVal('job-company', '');
    setVal('job-title', '');
    setVal('job-start', '');
    setVal('job-end', '');
    setChecked('job-current', false);
    setChecked('job-counts-exp', defaultType !== 'internship' && defaultType !== 'open_source');
  }

  modal.classList.add('active');
}

function closeJobModal(): void {
  document.getElementById('job-modal')?.classList.remove('active');
}

function setupJobModalEvents(): void {
  const modal = document.getElementById('job-modal');
  const form = document.getElementById('job-form') as HTMLFormElement;
  const cancelBtn = document.getElementById('job-cancel');
  const typeSelect = document.getElementById('job-type') as HTMLSelectElement;
  const countsCheckbox = document.getElementById('job-counts-exp') as HTMLInputElement;

  cancelBtn?.addEventListener('click', closeJobModal);
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeJobModal();
  });

  typeSelect?.addEventListener('change', () => {
    if (getVal('job-edit-idx') === '-1') {
      const selectedType = typeSelect.value;
      setChecked('job-counts-exp', selectedType !== 'internship' && selectedType !== 'open_source');
    }
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!activeProfileData) return;
    if (!activeProfileData.employmentHistory) activeProfileData.employmentHistory = [];

    const idx = parseInt(getVal('job-edit-idx'), 10);
    const type = getVal('job-type') as DetailedEmploymentRecord['employmentType'];
    const company = getVal('job-company');
    const title = getVal('job-title');
    const start = getVal('job-start');
    const current = getChecked('job-current');
    const end = current ? undefined : getOptVal('job-end');
    const counts = getChecked('job-counts-exp');

    if (!company || !title) {
      showToast('Please provide both employer name and title');
      return;
    }

    const jobRecord: DetailedEmploymentRecord = {
      id: idx >= 0 && activeProfileData.employmentHistory[idx] ? activeProfileData.employmentHistory[idx].id : `job_${Date.now()}`,
      employerName: company,
      jobTitle: title,
      startDate: start,
      endDate: end,
      currentlyEmployed: current,
      employmentType: type,
      isInternship: type === 'internship',
      countsTowardsExperience: counts,
    };

    if (idx >= 0 && idx < activeProfileData.employmentHistory.length) {
      activeProfileData.employmentHistory[idx] = jobRecord;
    } else {
      activeProfileData.employmentHistory.push(jobRecord);
    }

    await saveUserProfile(activeProfileData);
    closeJobModal();
    populateExperienceList();
    showToast(idx >= 0 ? '✓ Record updated' : '✓ Record added');
  });
}

function openExpOverrideModal(): void {
  const modal = document.getElementById('exp-override-modal');
  if (!modal || !activeProfileData) return;

  const derived = calculateDerivedExperience(
    activeProfileData.employmentHistory as any,
    activeProfileData.experienceOverrides
  );

  const overrides = activeProfileData.experienceOverrides;
  setVal('override-total-exp', overrides?.totalExperienceYears ?? derived.totalExperienceYears);
  setVal('override-fulltime-exp', overrides?.fullTimeYears ?? derived.fullTimeYears);
  setVal('override-tenure', overrides?.currentEmployerTenureYears ?? derived.currentEmployerTenureYears);
  setVal('override-employers', overrides?.totalEmployersCount ?? derived.totalEmployersCount);
  setVal('override-display-text', overrides?.displayTotalExperience ?? (derived.isOverridden ? derived.displayTotalExperience : ''));

  modal.classList.add('active');
}

function closeExpOverrideModal(): void {
  document.getElementById('exp-override-modal')?.classList.remove('active');
}

function setupExpOverrideModalEvents(): void {
  const modal = document.getElementById('exp-override-modal');
  const cancelBtn = document.getElementById('btn-cancel-override');
  const form = document.getElementById('exp-override-form') as HTMLFormElement;
  const fresherBtn = document.getElementById('btn-apply-fresher-preset');
  const editBtn = document.getElementById('btn-edit-exp-stats');
  const resetBtn = document.getElementById('btn-reset-exp-stats');

  editBtn?.addEventListener('click', openExpOverrideModal);
  cancelBtn?.addEventListener('click', closeExpOverrideModal);
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeExpOverrideModal();
  });

  fresherBtn?.addEventListener('click', () => {
    setVal('override-total-exp', 0);
    setVal('override-fulltime-exp', 0);
    setVal('override-tenure', 0);
    setVal('override-employers', 0);
    setVal('override-display-text', '0 years (Fresher)');
  });

  resetBtn?.addEventListener('click', async () => {
    if (!activeProfileData) return;
    if (!confirm('Reset experience stats to auto-calculated values based on your records?')) return;
    activeProfileData.experienceOverrides = undefined;
    await saveUserProfile(activeProfileData);
    populateExperienceList();
    showToast('✓ Reset to auto-calculated experience');
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!activeProfileData) return;

    const total = parseFloat(getVal('override-total-exp'));
    const ft = parseFloat(getVal('override-fulltime-exp'));
    const tenure = parseFloat(getVal('override-tenure'));
    const emps = parseInt(getVal('override-employers'), 10);
    const customDisplay = getVal('override-display-text');

    activeProfileData.experienceOverrides = {
      isOverridden: true,
      totalExperienceYears: isNaN(total) ? 0 : total,
      fullTimeYears: isNaN(ft) ? 0 : ft,
      currentEmployerTenureYears: isNaN(tenure) ? 0 : tenure,
      totalEmployersCount: isNaN(emps) ? 0 : emps,
      displayTotalExperience: customDisplay || (total === 0 ? '0 years (Fresher)' : `${total} years`),
    };

    await saveUserProfile(activeProfileData);
    closeExpOverrideModal();
    populateExperienceList();
    showToast('✓ Experience stats updated');
  });
}

// ── Work Preferences ───────────────────────────────────────────────────────

let currentPreferredLocations: string[] = [];

function renderCityTags(): void {
  const container = document.getElementById('wp-cities-container');
  if (!container) return;

  if (currentPreferredLocations.length === 0) {
    container.innerHTML = `
      <span style="font-size: 13px; color: var(--gray-400); font-style: italic;">
        No preferred locations added yet. Add cities above (e.g. Remote, San Francisco, London).
      </span>
    `;
    return;
  }

  let html = '';
  currentPreferredLocations.forEach((loc, idx) => {
    html += `
      <span class="city-tag">
        ${escapeHtml(loc)}
        <button type="button" class="btn-del-city" data-idx="${idx}" title="Remove location">&times;</button>
      </span>
    `;
  });
  setHTML(container, html);

  container.querySelectorAll('.btn-del-city').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt((btn as HTMLElement).dataset.idx!, 10);
      currentPreferredLocations.splice(idx, 1);
      renderCityTags();
    });
  });
}

function addCityTag(cityName: string): void {
  const trimmed = cityName.trim();
  if (!trimmed) return;
  // Case-insensitive duplicate check
  if (!currentPreferredLocations.some(l => l.toLowerCase() === trimmed.toLowerCase())) {
    currentPreferredLocations.push(trimmed);
    renderCityTags();
  }
}

function populateWorkPreferencesForm(): void {
  if (!activeProfileData) return;
  const wp = activeProfileData.workPreferences || createDefaultWorkPreferences();

  const types = wp.workplaceTypes || [];
  (['remote', 'hybrid', 'onsite', 'flexible'] as const).forEach(t =>
    setChecked(`wp-type-${t}`, types.includes(t))
  );

  currentPreferredLocations = [...(wp.preferredLocations || [])];
  renderCityTags();

  // Relocation
  const relocateVal = typeof wp.willingToRelocate === 'boolean' 
    ? (wp.willingToRelocate ? 'true' : 'false') 
    : (wp.willingToRelocate || 'false');
  setVal('wp-relocate', String(relocateVal));
  setChecked('wp-relocate-assist', Boolean(wp.relocationAssistanceRequired));

  // Travel
  setChecked('wp-travel-willing', Boolean(wp.willingToTravel));
  setVal('wp-travel-pct', wp.travelPercentage ?? '');

  // Earliest start (numeric days)
  const startDays = wp.earliestStartDays !== undefined 
    ? wp.earliestStartDays 
    : (wp.earliestStartDate && !isNaN(parseInt(wp.earliestStartDate, 10)) ? parseInt(wp.earliestStartDate, 10) : 0);
  setVal('wp-earliest-start-days', startDays);
  updateStartDaysDisplay(startDays);

  // Employment types
  const empTypes = wp.employmentTypes || ['full_time'];
  document.querySelectorAll<HTMLInputElement>('.wp-emp-type').forEach(cb => {
    cb.checked = empTypes.includes(cb.value as any);
  });

  // Shifts
  const shifts = wp.shiftPreferences || ['day', 'flexible'];
  document.querySelectorAll<HTMLInputElement>('.wp-shift').forEach(cb => {
    cb.checked = shifts.includes(cb.value as any);
  });
  setChecked('wp-overtime', Boolean(wp.overtimeWilling));

  // Targets
  setVal('wp-target-roles', (wp.targetRoleTitles || []).join(', '));
  setVal('wp-target-industries', (wp.targetIndustries || []).join(', '));

  // Salary
  setVal('wp-min-salary', wp.minimumAcceptableSalary ?? '');
  setVal('wp-target-salary', wp.targetSalary ?? '');
  setVal('wp-salary-currency', wp.salaryCurrency || 'USD');
  setVal('wp-salary-period', wp.salaryPeriod || 'annual');

  // Notes
  setVal('wp-notes', wp.notes || '');
}

async function saveWorkPreferences(): Promise<void> {
  if (!activeProfileData) return;
  if (!activeProfileData.workPreferences) {
    activeProfileData.workPreferences = createDefaultWorkPreferences();
  }
  const wp = activeProfileData.workPreferences;

  wp.workplaceTypes = (['remote', 'hybrid', 'onsite', 'flexible'] as const).filter(t => getChecked(`wp-type-${t}`));
  wp.preferredLocations = [...currentPreferredLocations];

  const relocVal = getVal('wp-relocate');
  wp.willingToRelocate = relocVal === 'true' ? true : relocVal === 'false' ? false : (relocVal as any);
  wp.relocationAssistanceRequired = getChecked('wp-relocate-assist');

  wp.willingToTravel = getChecked('wp-travel-willing');
  const travelPct = parseInt(getVal('wp-travel-pct'), 10);
  wp.travelPercentage = isNaN(travelPct) ? undefined : travelPct;

  const startDaysVal = parseInt(getVal('wp-earliest-start-days'), 10);
  wp.earliestStartDays = isNaN(startDaysVal) ? 0 : Math.max(0, startDaysVal);
  wp.earliestStartDate = wp.earliestStartDays === 0 ? 'Immediately' : `${wp.earliestStartDays} days`;

  wp.employmentTypes = Array.from(document.querySelectorAll<HTMLInputElement>('.wp-emp-type:checked')).map(cb => cb.value as any);
  wp.shiftPreferences = Array.from(document.querySelectorAll<HTMLInputElement>('.wp-shift:checked')).map(cb => cb.value as any);
  wp.overtimeWilling = getChecked('wp-overtime');

  const rolesStr = getVal('wp-target-roles');
  wp.targetRoleTitles = rolesStr ? rolesStr.split(',').map(s => s.trim()).filter(Boolean) : [];

  const indStr = getVal('wp-target-industries');
  wp.targetIndustries = indStr ? indStr.split(',').map(s => s.trim()).filter(Boolean) : [];

  const minSal = parseFloat(getVal('wp-min-salary'));
  wp.minimumAcceptableSalary = isNaN(minSal) ? undefined : minSal;

  const tgtSal = parseFloat(getVal('wp-target-salary'));
  wp.targetSalary = isNaN(tgtSal) ? undefined : tgtSal;

  wp.salaryCurrency = getVal('wp-salary-currency');
  wp.salaryPeriod = getVal('wp-salary-period') as any;
  wp.notes = getOptVal('wp-notes');

  await saveUserProfile(activeProfileData);
  showToast('✓ Work Preferences saved');
}

// ── Screening & Legal Disclosures ──────────────────────────────────────────

const CONSENT_FIELDS = [
  ['scr-consent-whatsapp', 'consentWhatsApp'],
  ['scr-consent-sms', 'consentSms'],
  ['scr-consent-phone-calls', 'consentPhoneCalls'],
  ['scr-consent-dnc-bypass', 'consentDncBypass'],
  ['scr-consent-future-opps', 'consentFutureOpportunities'],
  ['scr-consent-talent-sharing', 'consentTalentPoolSharing'],
  ['scr-consent-bg-check', 'backgroundCheckConsent'],
  ['scr-consent-ref-check', 'consentReferenceCheck'],
  ['scr-consent-drug-screen', 'drugScreeningConsent'],
  ['scr-consent-credit-check', 'consentCreditCheck'],
  ['scr-consent-privacy', 'consentPrivacyPolicy'],
  ['scr-consent-data-transfer', 'consentDataTransfer'],
  ['scr-consent-terms', 'consentTermsOfService'],
  ['scr-consent-esign', 'consentElectronicSignature'],
  ['scr-consent-truth', 'consentAccurateInformation'],
  ['scr-consent-at-will', 'consentAtWillEmployment'],
  ['scr-consent-ai', 'consentArtificialIntelligence'],
  ['scr-consent-eeo', 'consentEqualOpportunity'],
] as const;

function populateScreeningForm(): void {
  if (!activeProfileData) return;
  const scr = activeProfileData.legalDisclosures || createDefaultLegalAndDisclosures();

  setVal('scr-over-18', scr.over18 ? 'true' : 'false');
  setVal('scr-authorized', scr.legallyAuthorized ? 'true' : 'false');
  setVal('scr-sponsorship', scr.requiresSponsorship ? 'true' : 'false');

  setVal('scr-visa-status', scr.visaStatus || 'US Citizen / Permanent Resident');
  setVal('scr-sponsorship-timeline', scr.sponsorshipTimeline || 'Not in foreseeable future');

  setChecked('scr-opt-stem', Boolean(scr.optStemEligible));
  setVal('scr-opt-months', scr.optMonthsRemaining ?? '');

  setVal('scr-clearance', scr.securityClearance || 'none');
  setVal('scr-itar', scr.itarCompliant ? 'true' : 'false');

  setChecked('scr-driver-license', Boolean(scr.hasValidDriverLicense));
  setVal('scr-driver-state', scr.driverLicenseState || '');
  setChecked('scr-clean-driving', Boolean(scr.hasCleanDrivingRecord));

  setVal('scr-prev-employed', scr.previouslyEmployedAtCompany ? 'true' : 'false');
  setVal('scr-prev-employed-details', scr.previousEmploymentDetails || '');

  setVal('scr-relatives', scr.hasRelativesAtCompany ? 'true' : 'false');
  setVal('scr-relatives-details', scr.relativesDetails || '');

  setVal('scr-noncompete', scr.hasNonCompeteOrRestrictions ? 'true' : 'false');
  setVal('scr-noncompete-details', scr.nonCompeteDetails || '');

  setVal('scr-bg-check', scr.backgroundCheckConsent ? 'true' : 'false');
  setVal('scr-drug-screen', scr.drugScreeningConsent ? 'true' : 'false');

  setVal('scr-referral-source', scr.referralSource || 'LinkedIn');
  setVal('scr-referrer-name', scr.referrerName || '');
  setVal('scr-referrer-email', scr.referrerEmail || '');

  // Consents & Authorizations
  CONSENT_FIELDS.forEach(([id, prop]) => {
    setChecked(id, (scr as any)[prop] !== false);
  });
}

async function saveScreening(): Promise<void> {
  if (!activeProfileData) return;
  if (!activeProfileData.legalDisclosures) {
    activeProfileData.legalDisclosures = createDefaultLegalAndDisclosures();
  }
  const scr = activeProfileData.legalDisclosures;

  scr.over18 = getVal('scr-over-18') === 'true';
  scr.legallyAuthorized = getVal('scr-authorized') === 'true';
  scr.requiresSponsorship = getVal('scr-sponsorship') === 'true';

  scr.visaStatus = getVal('scr-visa-status');
  scr.sponsorshipTimeline = getVal('scr-sponsorship-timeline');

  scr.optStemEligible = getChecked('scr-opt-stem');
  const optMonths = parseInt(getVal('scr-opt-months'), 10);
  scr.optMonthsRemaining = isNaN(optMonths) ? undefined : optMonths;

  scr.securityClearance = getVal('scr-clearance') as any;
  scr.itarCompliant = getVal('scr-itar') === 'true';

  scr.hasValidDriverLicense = getChecked('scr-driver-license');
  scr.driverLicenseState = getOptVal('scr-driver-state');
  scr.hasCleanDrivingRecord = getChecked('scr-clean-driving');

  scr.previouslyEmployedAtCompany = getVal('scr-prev-employed') === 'true';
  scr.previousEmploymentDetails = getOptVal('scr-prev-employed-details');

  scr.hasRelativesAtCompany = getVal('scr-relatives') === 'true';
  scr.relativesDetails = getOptVal('scr-relatives-details');

  scr.hasNonCompeteOrRestrictions = getVal('scr-noncompete') === 'true';
  scr.nonCompeteDetails = getOptVal('scr-noncompete-details');

  scr.referralSource = getVal('scr-referral-source');
  scr.referrerName = getOptVal('scr-referrer-name');
  scr.referrerEmail = getOptVal('scr-referrer-email');

  // Consents & Authorizations
  CONSENT_FIELDS.forEach(([id, prop]) => {
    (scr as any)[prop] = getChecked(id, (scr as any)[prop] ?? true);
  });

  // Sync existing legacy dropdowns if present
  setVal('scr-bg-check', scr.backgroundCheckConsent ? 'true' : 'false');
  setVal('scr-drug-screen', scr.drugScreeningConsent ? 'true' : 'false');

  await saveUserProfile(activeProfileData);
  showToast('✓ Screening, Disclosures & Consents saved');
}

function setupConsentListeners(): void {
  document.getElementById('btn-save-consents')?.addEventListener('click', saveScreening);
  document.getElementById('btn-consent-select-all')?.addEventListener('click', () => {
    document.querySelectorAll<HTMLInputElement>('.consent-checkbox').forEach(cb => {
      cb.checked = true;
    });
    showToast('✓ All consents selected');
  });
  document.getElementById('btn-consent-clear-all')?.addEventListener('click', () => {
    document.querySelectorAll<HTMLInputElement>('.consent-checkbox').forEach(cb => {
      cb.checked = false;
    });
    showToast('✓ All consents cleared');
  });
  // Sync background check dropdown and checkbox
  const bgCheckSelect = document.getElementById('scr-bg-check') as HTMLSelectElement | null;
  const bgCheckCb = document.getElementById('scr-consent-bg-check') as HTMLInputElement | null;
  bgCheckSelect?.addEventListener('change', () => {
    if (bgCheckCb) bgCheckCb.checked = bgCheckSelect.value === 'true';
  });
  bgCheckCb?.addEventListener('change', () => {
    if (bgCheckSelect) bgCheckSelect.value = bgCheckCb.checked ? 'true' : 'false';
  });
  // Sync drug screen dropdown and checkbox
  const drugSelect = document.getElementById('scr-drug-screen') as HTMLSelectElement | null;
  const drugCb = document.getElementById('scr-consent-drug-screen') as HTMLInputElement | null;
  drugSelect?.addEventListener('change', () => {
    if (drugCb) drugCb.checked = drugSelect.value === 'true';
  });
  drugCb?.addEventListener('change', () => {
    if (drugSelect) drugSelect.value = drugCb.checked ? 'true' : 'false';
  });
}

// ── Family & Contacts ──────────────────────────────────────────────────────

function populateFamilyList(): void {
  const container = document.getElementById('family-contacts-container')!;
  const contacts = activeProfileData?.familyContacts || [];

  if (contacts.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 28px; color: var(--gray-600); font-size: 13.5px;">
        No family or emergency contacts added yet. Click "+ Add Contact" to add Father, Mother, Guardian, or Emergency Contact.
      </div>
    `;
    return;
  }

  let html = '';
  contacts.forEach((c, idx) => {
    html += `
      <div class="record-item">
        <div class="record-details">
          <div class="record-title">${escapeHtml(c.name)} <span style="font-weight:400;color:var(--gray-600);">(${escapeHtml(c.relationship)})</span></div>
          <div class="record-subtitle">Phone: ${escapeHtml(formatPhone(c.phone as any))} ${c.email ? `· Email: ${escapeHtml(c.email)}` : ''}</div>
          <div class="record-tags">
            ${c.occupation ? `<span class="record-tag">Occupation: ${escapeHtml(c.occupation)}</span>` : ''}
            ${c.employer ? `<span class="record-tag">Employer: ${escapeHtml(c.employer)}</span>` : ''}
            ${c.isEmergencyContact ? '<span class="record-tag" style="background:#fef2f2;color:#dc2626;">Emergency Contact</span>' : ''}
          </div>
        </div>
        <button type="button" class="btn-action-danger btn-del-fam" data-idx="${idx}">Delete</button>
      </div>
    `;
  });

  setHTML(container, html);

  container.querySelectorAll('.btn-del-fam').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt((btn as HTMLElement).dataset.idx!, 10);
      activeProfileData?.familyContacts?.splice(idx, 1);
      await saveUserProfile(activeProfileData!);
      populateFamilyList();
      showToast('✓ Family contact removed');
    });
  });
}

function openFamilyModal(): void {
  const modal = document.getElementById('family-modal');
  if (!modal) return;
  setVal('family-modal-rel', 'father');
  setVal('family-modal-name', '');
  setVal('family-modal-phone-cc', '+1');
  setVal('family-modal-phone-num', '');
  setVal('family-modal-occ', '');
  setVal('family-modal-email', '');
  setChecked('family-modal-emergency', false);
  modal.classList.add('active');
}

function closeFamilyModal(): void {
  document.getElementById('family-modal')?.classList.remove('active');
}

function setupFamilyModalEvents(): void {
  const modal = document.getElementById('family-modal');
  const form = document.getElementById('family-modal-form') as HTMLFormElement | null;
  const cancelBtn = document.getElementById('family-modal-cancel');

  cancelBtn?.addEventListener('click', closeFamilyModal);
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeFamilyModal();
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!activeProfileData) return;
    if (!activeProfileData.familyContacts) activeProfileData.familyContacts = [];

    const rel = getVal('family-modal-rel');
    const name = getVal('family-modal-name');
    const phoneCc = getVal('family-modal-phone-cc') || '+1';
    const phoneNum = getVal('family-modal-phone-num');
    const occ = getOptVal('family-modal-occ');
    const email = getOptVal('family-modal-email');
    const isEmergency = getChecked('family-modal-emergency') || rel === 'emergency';

    const normalizedCc = phoneCc.startsWith('+') ? phoneCc : `+${phoneCc}`;
    const formattedPhone = `${normalizedCc} ${phoneNum}`.trim();

    const contact: FamilyContact = {
      id: `fc_${Date.now()}`,
      relationship: rel as any,
      name,
      phone: {
        countryCode: normalizedCc,
        number: phoneNum,
        formatted: formattedPhone,
      } as any,
      occupation: occ,
      email: email,
      isEmergencyContact: isEmergency,
    };

    activeProfileData.familyContacts.push(contact);
    await saveUserProfile(activeProfileData);
    closeFamilyModal();
    populateFamilyList();
    showToast('✓ Family contact added');
  });
}

// ── Hub Packs (Country & Employment Modules) ───────────────────────────────

function renderPackCard(pack: any, storedPackData: Record<string, any>, prefix: 'cp' | 'ep'): HTMLElement {
  const packCard = document.createElement('div');
  packCard.className = `${prefix === 'cp' ? 'country' : 'employment'}-pack-hub-card`;
  packCard.dataset.packId = pack.id;
  packCard.style.cssText = 'margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid var(--border-color);';

  const icon = pack.icon || (prefix === 'cp' ? '🌐' : '💼');
  const name = pack.countryName || pack.name;
  const desc = pack.description || '';

  let fieldsHtml = '';
  pack.fields.forEach((f: any) => {
    const fieldId = `${prefix}_${pack.id.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${f.key}`;
    const curVal = storedPackData[f.key] ?? f.defaultValue ?? '';

    let sensBadge = '';
    if (f.sensitivity === 'restricted_identifier') {
      sensBadge = '<span class="badge-sens restricted" style="margin-left: 6px;">Restricted</span>';
    } else if (f.sensitivity === 'sensitive_personal') {
      sensBadge = '<span class="badge-sens sensitive" style="margin-left: 6px;">Sensitive</span>';
    }

    let inputHtml = '';
    if (f.dataType === 'choice') {
      const opts = (f.options || []).map((opt: string) => {
        const sel = String(curVal) === String(opt) ? 'selected' : '';
        const optLabel = opt.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
        return `<option value="${opt}" ${sel}>${optLabel}</option>`;
      }).join('');
      inputHtml = `<select id="${fieldId}" data-field-key="${f.key}" class="field-select">${opts}</select>`;
    } else if (f.dataType === 'boolean') {
      const isTrue = curVal === true || String(curVal) === 'true';
      inputHtml = `
        <select id="${fieldId}" data-field-key="${f.key}" class="field-select">
          <option value="false" ${!isTrue ? 'selected' : ''}>No</option>
          <option value="true" ${isTrue ? 'selected' : ''}>Yes</option>
        </select>
      `;
    } else if (f.dataType === 'number') {
      inputHtml = `<input type="number" step="any" id="${fieldId}" data-field-key="${f.key}" class="field-input" placeholder="${f.placeholder || ''}" value="${curVal !== '' ? curVal : ''}">`;
    } else if (f.dataType === 'date') {
      inputHtml = `<input type="date" id="${fieldId}" data-field-key="${f.key}" class="field-input" value="${curVal || ''}">`;
    } else if (f.dataType === 'textarea') {
      inputHtml = `<textarea id="${fieldId}" data-field-key="${f.key}" class="field-input" style="min-height: 70px;" placeholder="${f.placeholder || ''}">${curVal || ''}</textarea>`;
    } else if (f.dataType === 'url') {
      inputHtml = `
        <div style="display: flex; gap: 6px;">
          <input type="url" id="${fieldId}" data-field-key="${f.key}" class="field-input" placeholder="${f.placeholder || ''}" value="${curVal || ''}" style="flex: 1;">
          ${curVal ? `<button type="button" class="btn-copy-url" data-url="${curVal}" style="padding: 6px 10px; font-size: 11px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-card); cursor: pointer;" title="Copy URL">📋</button>` : ''}
        </div>
      `;
    } else if (f.dataType === 'masked_identifier') {
      inputHtml = `
        <div style="display: flex; gap: 6px;">
          <input type="password" id="${fieldId}" data-field-key="${f.key}" class="field-input" placeholder="${f.placeholder || ''}" value="${curVal || ''}" style="flex: 1;">
          <button type="button" class="btn-toggle-mask" data-target="${fieldId}" style="padding: 6px 10px; font-size: 12px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-card); cursor: pointer;" title="Toggle visibility">👁</button>
        </div>
      `;
    } else {
      inputHtml = `<input type="text" id="${fieldId}" data-field-key="${f.key}" class="field-input" placeholder="${f.placeholder || ''}" value="${curVal || ''}">`;
    }

    const helpTextHtml = f.helpText ? `<div style="font-size: 11px; color: var(--text-muted); margin-top: 3px;">${f.helpText}</div>` : '';
    const categoryLabel = f.category ? `<span style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted);">${f.category}</span>` : '';

    fieldsHtml += `
      <div class="field-group">
        <label style="display: flex; align-items: center; justify-content: space-between;">
          <div>
            <span>${f.label}</span>
            ${categoryLabel ? ` <span style="font-weight: 400; opacity: 0.7;">· ${categoryLabel}</span>` : ''}
          </div>
          ${sensBadge}
        </label>
        ${inputHtml}
        ${helpTextHtml}
      </div>
    `;
  });

  packCard.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;">
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="font-size: 22px;">${icon}</span>
        <div>
          <h3 style="font-size: 15px; font-weight: 700; color: var(--text-primary); margin: 0;">${name} <span style="font-size: 12px; font-weight: 600; color: var(--text-muted); margin-left: 6px;">(${pack.id})</span></h3>
          <p style="font-size: 12px; color: var(--text-muted); margin: 2px 0 0 0;">${desc}</p>
        </div>
      </div>
      <span class="badge-sens" style="background: var(--bg-muted); color: var(--text-muted); font-size: 11px; font-weight: 600;">${pack.fields.length} Fields</span>
    </div>
    <div class="form-grid-3">
      ${fieldsHtml}
    </div>
  `;

  // Wire toggle-mask buttons
  packCard.querySelectorAll('.btn-toggle-mask').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = (btn as HTMLElement).dataset.target!;
      const targetInput = document.getElementById(targetId) as HTMLInputElement;
      if (targetInput) {
        targetInput.type = targetInput.type === 'password' ? 'text' : 'password';
      }
    });
  });

  // Wire copy-url buttons
  packCard.querySelectorAll('.btn-copy-url').forEach(btn => {
    btn.addEventListener('click', () => {
      const urlToCopy = (btn as HTMLElement).dataset.url;
      if (urlToCopy) {
        navigator.clipboard.writeText(urlToCopy);
        showToast('Copied link to clipboard');
      }
    });
  });

  return packCard;
}

function collectPackDataFromContainer(container: HTMLElement): Record<string, Record<string, any>> {
  const result: Record<string, Record<string, any>> = {};
  container.querySelectorAll<HTMLElement>('[data-pack-id]').forEach(card => {
    const pId = card.dataset.packId!;
    const packObj: Record<string, any> = {};

    card.querySelectorAll('[data-field-key]').forEach(inputEl => {
      const key = (inputEl as HTMLElement).dataset.fieldKey!;
      let val: any;
      if (inputEl instanceof HTMLInputElement) {
        if (inputEl.type === 'number') {
          val = inputEl.value !== '' ? parseFloat(inputEl.value) : undefined;
        } else {
          val = inputEl.value.trim() || undefined;
        }
      } else if (inputEl instanceof HTMLTextAreaElement) {
        val = inputEl.value.trim() || undefined;
      } else if (inputEl instanceof HTMLSelectElement) {
        if (inputEl.value === 'true') val = true;
        else if (inputEl.value === 'false') val = false;
        else val = inputEl.value;
      }
      if (val !== undefined) {
        packObj[key] = val;
      }
    });

    result[pId] = packObj;
  });
  return result;
}

// ── Country-Packs (Jurisdiction Modules) ───────────────────────────────────

async function populateCountryPacksHub(): Promise<void> {
  if (!activeProfileData) return;
  const container = document.getElementById('country-packs-hub-container');
  if (!container) return;

  const activePacks = await getActivePacks();

  if (activePacks.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
        <div style="font-size: 32px; margin-bottom: 12px;">🌐</div>
        <div style="font-size: 15px; font-weight: 600; color: var(--text-primary); margin-bottom: 6px;">No Country-Packs Active</div>
        <p style="font-size: 13px; max-width: 440px; margin: 0 auto 16px;">
          Enable regional modules for India (IN-pack), United States (US-pack), Germany (DE-pack), or United Kingdom (GB-pack) in Settings to configure jurisdiction-specific compliance fields and campus records.
        </p>
        <a href="../settings/settings.html#section-country-packs" target="_blank" class="btn-action-primary" style="display: inline-block; text-decoration: none;">Go to Settings →</a>
      </div>
    `;
    return;
  }

  if (!activeProfileData.countryPacksData) {
    activeProfileData.countryPacksData = {};
  }

  // If India Pack exists in legacy object, ensure it's seeded in countryPacksData['IN-pack']
  if (activeProfileData.indiaPack && !activeProfileData.countryPacksData['IN-pack']) {
    const ip = activeProfileData.indiaPack;
    activeProfileData.countryPacksData['IN-pack'] = {
      tenth_percentage: ip.tenthPercentage,
      tenth_passing_year: ip.tenthPassingYear,
      tenth_board: ip.tenthBoard,
      twelfth_percentage: ip.twelfthPercentage,
      twelfth_passing_year: ip.twelfthPassingYear,
      twelfth_board: ip.twelfthBoard || ip.twelfthStream,
      undergrad_cgpa: ip.undergradCgpa,
      cgpa_conversion_formula: ip.cgpaConversionFormula,
      student_registration_number: ip.studentRegistrationNumber || ip.universityRollNumber,
      active_backlogs: ip.activeBacklogsCount,
      history_of_backlogs: ip.clearedBacklogsCount,
      academic_gap_years: ip.educationGapYears,
      current_ctc_lpa: ip.currentCtcLpa,
      expected_ctc_lpa: ip.expectedCtcLpa,
      willing_to_sign_bond: ip.willingToSignBond,
      aadhaar_number: ip.aadhaarNumberMasked,
      pan_number: ip.panNumberMasked,
      day_scholar_or_hosteller: ip.dayScholarOrHosteller,
    };
  }

  container.innerHTML = '';
  activePacks.forEach(pack => {
    const stored = activeProfileData?.countryPacksData?.[pack.id] || {};
    container.appendChild(renderPackCard(pack, stored, 'cp'));
  });
}

async function saveCountryPacks(): Promise<void> {
  if (!activeProfileData) return;
  if (!activeProfileData.countryPacksData) {
    activeProfileData.countryPacksData = {};
  }

  const container = document.getElementById('country-packs-hub-container');
  if (!container) return;

  const packData = collectPackDataFromContainer(container);
  Object.assign(activeProfileData.countryPacksData, packData);

  // Sync back to legacy indiaPack for full backwards compatibility
  const inPack = packData['IN-pack'];
  if (inPack) {
    if (!activeProfileData.indiaPack) {
      activeProfileData.indiaPack = createDefaultIndiaPack();
    }
    const ip = activeProfileData.indiaPack;
    ip.enabled = true;
    ip.tenthPercentage = inPack.tenth_percentage;
    ip.tenthPassingYear = inPack.tenth_passing_year;
    ip.tenthBoard = inPack.tenth_board;
    ip.twelfthPercentage = inPack.twelfth_percentage;
    ip.twelfthPassingYear = inPack.twelfth_passing_year;
    ip.twelfthBoard = inPack.twelfth_board;
    ip.undergradCgpa = inPack.undergrad_cgpa;
    ip.cgpaConversionFormula = inPack.cgpa_conversion_formula;
    ip.studentRegistrationNumber = inPack.student_registration_number;
    ip.activeBacklogsCount = inPack.active_backlogs ?? 0;
    ip.clearedBacklogsCount = inPack.history_of_backlogs ?? 0;
    ip.educationGapYears = inPack.academic_gap_years ?? 0;
    ip.currentCtcLpa = inPack.current_ctc_lpa;
    ip.expectedCtcLpa = inPack.expected_ctc_lpa;
    ip.willingToSignBond = Boolean(inPack.willing_to_sign_bond);
    ip.aadhaarNumberMasked = inPack.aadhaar_number;
    ip.panNumberMasked = inPack.pan_number;
    ip.dayScholarOrHosteller = inPack.day_scholar_or_hosteller;
  }

  await saveUserProfile(activeProfileData);
  showToast('✓ Country-Packs saved');
}

async function populateEmploymentPacksHub(): Promise<void> {
  if (!activeProfileData) return;
  const container = document.getElementById('employment-packs-hub-container');
  if (!container) return;

  const activePacks = await getActiveEmploymentPacks();

  if (activePacks.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
        <div style="font-size: 32px; margin-bottom: 12px;">💼</div>
        <div style="font-size: 15px; font-weight: 600; color: var(--text-primary); margin-bottom: 6px;">No Employment-Packs Active</div>
        <p style="font-size: 13px; max-width: 440px; margin: 0 auto 16px;">
          Enable role modules for Software Engineering (cs-pack), Design (design-pack), or Data Science (data-science-pack) in Settings to configure coding platform handles, repositories, and portfolios.
        </p>
        <a href="../settings/settings.html#section-employment-packs" target="_blank" class="btn-action-primary" style="display: inline-block; text-decoration: none;">Go to Settings →</a>
      </div>
    `;
    return;
  }

  if (!activeProfileData.employmentPacksData) {
    activeProfileData.employmentPacksData = {};
  }

  container.innerHTML = '';
  activePacks.forEach(pack => {
    const stored = activeProfileData?.employmentPacksData?.[pack.id] || {};
    container.appendChild(renderPackCard(pack, stored, 'ep'));
  });
}

async function saveEmploymentPacks(): Promise<void> {
  if (!activeProfileData) return;
  if (!activeProfileData.employmentPacksData) {
    activeProfileData.employmentPacksData = {};
  }

  const container = document.getElementById('employment-packs-hub-container');
  if (!container) return;

  const packData = collectPackDataFromContainer(container);
  Object.assign(activeProfileData.employmentPacksData, packData);

  await saveUserProfile(activeProfileData);
  showToast('✓ Employment-Packs saved');
}

// ── Custom Field Builder ───────────────────────────────────────────────────

function setupCustomFieldBuilderEvents(): void {
  const lblInput = document.getElementById('builder-label') as HTMLInputElement;
  const secSelect = document.getElementById('builder-section') as HTMLSelectElement;
  const typeSelect = document.getElementById('builder-type') as HTMLSelectElement;
  const sensSelect = document.getElementById('builder-sensitivity') as HTMLSelectElement;
  const aliasesInput = document.getElementById('builder-aliases') as HTMLInputElement;
  const valInput = document.getElementById('builder-value') as HTMLInputElement;

  function updateLivePreview(): void {
    const l = lblInput.value.trim() || 'Secondary qualification result';
    const s = secSelect.options[secSelect.selectedIndex].text;
    const t = typeSelect.value;
    const sens = sensSelect.options[sensSelect.selectedIndex].text;
    const aliases = aliasesInput.value.trim() || 'School result, high school grades, secondary examination score';
    const val = valInput.value.trim() || 'No value entered';

    document.getElementById('prev-title')!.textContent = l;
    document.getElementById('prev-meta')!.textContent = `${s} · ${t} · ${sens}`;
    document.getElementById('prev-aliases')!.textContent = `Aliases: ${aliases}`;
    document.getElementById('prev-val')!.textContent = val;
  }

  [lblInput, secSelect, typeSelect, sensSelect, aliasesInput, valInput].forEach(el => {
    el?.addEventListener('input', updateLivePreview);
  });

  document.getElementById('btn-save-custom-field')?.addEventListener('click', async () => {
    const label = lblInput.value.trim();
    if (!label) {
      lblInput.focus();
      return;
    }

    const key = label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

    const aliases = aliasesInput.value
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);

    const cf = createDefaultCustomField(
      key,
      label,
      secSelect.value as any,
      typeSelect.value as any,
      aliases
    );
    cf.sensitivity = sensSelect.value as any;
    cf.value = valInput.value.trim() || undefined;
    cf.requiresConfirmation = cf.sensitivity === 'restricted_identifier';
    cf.aiAccessPermitted = cf.sensitivity !== 'restricted_identifier';

    if (!activeProfileData) return;
    if (!activeProfileData.customFields) activeProfileData.customFields = [];

    // Replace if key exists, otherwise append
    const existingIdx = activeProfileData.customFields.findIndex(x => x.key === key);
    if (existingIdx >= 0) {
      activeProfileData.customFields[existingIdx] = cf;
    } else {
      activeProfileData.customFields.push(cf);
    }

    await saveUserProfile(activeProfileData);
    populateCustomFieldsList();
    showToast(`✓ Custom field "${label}" saved`);

    // Reset form
    lblInput.value = '';
    aliasesInput.value = '';
    valInput.value = '';
    updateLivePreview();
  });

  document.getElementById('btn-reset-builder')?.addEventListener('click', () => {
    lblInput.value = '';
    aliasesInput.value = '';
    valInput.value = '';
    updateLivePreview();
  });
}

function populateCustomFieldsList(): void {
  const container = document.getElementById('custom-fields-container')!;
  const fields = activeProfileData?.customFields || [];

  if (fields.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 28px; color: var(--gray-600); font-size: 13.5px;">
        No custom fields defined yet. Use the Custom Field Builder above to create your first field.
      </div>
    `;
    return;
  }

  let html = '';
  fields.forEach((cf, idx) => {
    html += `
      <div class="record-item">
        <div class="record-details">
          <div class="record-title">${escapeHtml(cf.label)} <span style="font-weight:400;color:var(--gray-600);font-size:12px;">(${cf.key})</span></div>
          <div class="record-subtitle">Value: <strong>${escapeHtml(String(cf.value ?? 'None'))}</strong></div>
          <div class="record-tags">
            <span class="record-tag">Section: ${escapeHtml(cf.sectionId)}</span>
            <span class="record-tag">Type: ${escapeHtml(cf.dataType)}</span>
            <span class="record-tag">${cf.sensitivity.replace('_', ' ')}</span>
            ${cf.aliases && cf.aliases.length > 0 ? `<span class="record-tag">Aliases: ${escapeHtml(cf.aliases.join(', '))}</span>` : ''}
          </div>
        </div>
        <button type="button" class="btn-action-danger btn-del-cf" data-idx="${idx}">Delete</button>
      </div>
    `;
  });

  setHTML(container, html);

  container.querySelectorAll('.btn-del-cf').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt((btn as HTMLElement).dataset.idx!, 10);
      activeProfileData?.customFields?.splice(idx, 1);
      await saveUserProfile(activeProfileData!);
      populateCustomFieldsList();
      showToast('✓ Custom field deleted');
    });
  });
}

// ── Question Bank ──────────────────────────────────────────────────────────

function populateQuestionBankList(): void {
  const container = document.getElementById('question-bank-container')!;
  const items = activeProfileData?.questionBank || [];

  if (items.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 28px; color: var(--gray-600); font-size: 13.5px;">
        No saved answers in your Question Bank yet. Click "+ Add Saved Answer" to store reusable answers for screening questions.
      </div>
    `;
    return;
  }

  let html = '';
  items.forEach((item, idx) => {
    html += `
      <div class="qb-item">
        <div class="qb-header">
          <div class="qb-question">${escapeHtml(item.question)}</div>
          <div style="display:flex;gap:8px;align-items:center;">
            <span class="record-tag" style="background:#e0f2fe;color:#0369a1;">${item.category}</span>
            <button type="button" class="btn-action-danger btn-del-qb" data-idx="${idx}">Delete</button>
          </div>
        </div>
        ${item.aliases && item.aliases.length > 0 ? `<div style="font-size:12px;color:var(--gray-600);margin-bottom:4px;">Aliases: ${escapeHtml(item.aliases.join(', '))}</div>` : ''}
        <div class="qb-answer">${escapeHtml(item.answer)}</div>
      </div>
    `;
  });

  setHTML(container, html);

  container.querySelectorAll('.btn-del-qb').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt((btn as HTMLElement).dataset.idx!, 10);
      activeProfileData?.questionBank?.splice(idx, 1);
      await saveUserProfile(activeProfileData!);
      populateQuestionBankList();
      showToast('✓ Question removed');
    });
  });
}

function openQuestionModal(): void {
  const modal = document.getElementById('qb-modal');
  if (!modal) return;
  setVal('qb-modal-category', 'screening');
  setVal('qb-modal-question', '');
  setVal('qb-modal-aliases', '');
  setVal('qb-modal-answer', '');
  modal.classList.add('active');
}

function closeQuestionModal(): void {
  document.getElementById('qb-modal')?.classList.remove('active');
}

function setupQuestionModalEvents(): void {
  const modal = document.getElementById('qb-modal');
  const form = document.getElementById('qb-modal-form') as HTMLFormElement | null;
  const cancelBtn = document.getElementById('qb-modal-cancel');

  cancelBtn?.addEventListener('click', closeQuestionModal);
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeQuestionModal();
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!activeProfileData) return;
    if (!activeProfileData.questionBank) activeProfileData.questionBank = [];

    const category = getVal('qb-modal-category');
    const q = getVal('qb-modal-question');
    const aliasesStr = getVal('qb-modal-aliases');
    const a = getVal('qb-modal-answer');

    const item: QuestionBankItem = {
      id: `qb_${Date.now()}`,
      question: q,
      aliases: aliasesStr.split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
      answer: a,
      category: category as any,
      isVerified: true,
      companyScoped: false,
      lastUpdated: Date.now(),
    };

    activeProfileData.questionBank.push(item);
    await saveUserProfile(activeProfileData);
    closeQuestionModal();
    populateQuestionBankList();
    showToast('✓ Screening question added');
  });
}

// ── Multi-Profile Management ───────────────────────────────────────────────

function renderProfilesGrid(): void {
  const grid = document.getElementById('profiles-grid')!;
  let html = '';

  for (const p of allProfiles) {
    const isActive = p.id === activeId;
    html += `
      <div class="profile-card ${isActive ? 'active' : ''}" data-id="${escapeHtml(p.id)}">
        <div class="profile-card-header">
          <div class="profile-card-dot" style="background:${p.color}">${initials(p.name)}</div>
          <div>
            <div class="profile-card-name">${escapeHtml(p.name)}</div>
            ${p.targetRole ? `<div class="profile-card-role">${escapeHtml(p.targetRole)}</div>` : ''}
          </div>
        </div>
        <div class="profile-card-actions">
          ${!isActive ? `<button type="button" class="btn-activate" data-activate="${escapeHtml(p.id)}">Activate</button>` : '<button type="button" disabled style="background:var(--green-light);color:var(--green);cursor:default;">Active</button>'}
          ${allProfiles.length > 1 ? `<button type="button" class="btn-delete-card" data-delete="${escapeHtml(p.id)}" title="Delete profile">&times;</button>` : ''}
        </div>
      </div>
    `;
  }

  setHTML(grid, html);

  grid.querySelectorAll('[data-activate]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = (btn as HTMLElement).dataset.activate!;
      await setActiveProfile(id);
      await browser.runtime.sendMessage({ kind: 'SWITCH_PROFILE', profileId: id });
      await init();
      showToast('✓ Switched active profile');
    });
  });

  grid.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = (btn as HTMLElement).dataset.delete!;
      const p = allProfiles.find(x => x.id === id);
      if (!p) return;
      if (!confirm(`Delete profile "${p.name}"?`)) return;
      await deleteProfile(id);
      await init();
      showToast('✓ Profile deleted');
    });
  });
}

async function renderGistHubCard(): Promise<void> {
  const dot = document.getElementById('hub-gist-status-dot');
  const statusText = document.getElementById('hub-gist-status-text');
  const metaText = document.getElementById('hub-gist-meta-text');
  const alertEl = document.getElementById('hub-gist-modified-alert');
  const listEl = document.getElementById('hub-gist-modified-list');

  const config = await getGistSyncConfig();
  if (!config.patToken || !config.gistId) {
    if (dot) dot.style.background = '#94a3b8';
    if (statusText) statusText.textContent = 'Gist sync not configured';
    if (metaText) metaText.textContent = 'Open Settings to link a token and secret gist.';
  } else {
    if (dot) dot.style.background = '#10b981';
    if (statusText) statusText.textContent = 'Secret Gist Connected & Ready';
    const lastSync = config.lastSyncTime
      ? `Last synced: ${new Date(config.lastSyncTime).toLocaleTimeString()}`
      : 'Ready to backup';
    if (metaText) metaText.textContent = `${lastSync} (Auto-sync: ${config.autoSync ? 'Enabled' : 'Off'})`;
  }

  if (alertEl && listEl) {
    if (config.lastModifiedFields && config.lastModifiedFields.length > 0) {
      listEl.innerHTML = config.lastModifiedFields
        .map(
          (m: ModifiedFieldNotice) =>
            `<li><strong>${escapeHtml(m.label)}</strong> (<code>${escapeHtml(m.path)}</code>): ${escapeHtml(m.reason)}</li>`
        )
        .join('');
      alertEl.style.display = 'block';
    } else {
      alertEl.style.display = 'none';
    }
  }
}

function setupActionButtons(): void {
  document.getElementById('btn-save-personal')?.addEventListener('click', savePersonal);
  document.getElementById('btn-save-passport')?.addEventListener('click', savePassport);

  const togglePassportMaskBtn = document.getElementById('btn-toggle-passport-mask');
  const passportInput = document.getElementById('core-passport-num') as HTMLInputElement | null;
  togglePassportMaskBtn?.addEventListener('click', () => {
    if (!passportInput) return;
    const isPassword = passportInput.type === 'password';
    passportInput.type = isPassword ? 'text' : 'password';
    const icon = document.getElementById('eye-icon-passport');
    if (icon) {
      icon.innerHTML = isPassword
        ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'
        : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
    }
  });

  document.getElementById('btn-save-links')?.addEventListener('click', saveLinks);
  document.getElementById('btn-add-education')?.addEventListener('click', openEducationModal);
  document.getElementById('btn-add-certification')?.addEventListener('click', () => openCertificationModal());
  document.getElementById('btn-add-employment')?.addEventListener('click', () => openJobModal(undefined, 'full_time'));
  document.getElementById('btn-add-internship')?.addEventListener('click', () => openJobModal(undefined, 'internship'));
  document.getElementById('btn-save-work-preferences')?.addEventListener('click', saveWorkPreferences);
  document.getElementById('btn-save-screening')?.addEventListener('click', saveScreening);
  document.getElementById('btn-add-family-contact')?.addEventListener('click', openFamilyModal);
  document.getElementById('btn-save-country-packs')?.addEventListener('click', saveCountryPacks);
  document.getElementById('btn-save-india-pack')?.addEventListener('click', saveCountryPacks);
  document.getElementById('btn-save-employment-packs')?.addEventListener('click', saveEmploymentPacks);
  document.getElementById('btn-add-question')?.addEventListener('click', openQuestionModal);

  document.getElementById('btn-hub-gist-push')?.addEventListener('click', async () => {
    const config = await getGistSyncConfig();
    if (!config.patToken || !config.gistId) {
      showToast('⚠️ Gist not configured. Please open Settings.');
      return;
    }
    showToast('Backing up profile to Secret Gist...');
    const res = await pushToGist();
    if (res.success) {
      showToast('✓ Successfully backed up to Secret Gist!');
    } else {
      showToast(`✗ Backup failed: ${res.error || 'Error'}`);
    }
    await renderGistHubCard();
  });

  document.getElementById('btn-hub-gist-pull')?.addEventListener('click', async () => {
    const config = await getGistSyncConfig();
    if (!config.patToken || !config.gistId) {
      showToast('⚠️ Gist not configured. Please open Settings.');
      return;
    }
    showToast('Pulling from Secret Gist...');
    const res = await pullFromGist();
    if (res.success) {
      await init();
      if (res.reconciliation?.hasModifications) {
        showToast(`⚠️ Restored, but ${res.reconciliation.modifiedFields.length} field(s) were reset and need review.`);
      } else {
        showToast('✓ Successfully restored profile from Secret Gist!');
      }
    } else {
      showToast(`✗ Restore failed: ${res.error || 'Error'}`);
    }
    await renderGistHubCard();
  });

  setupEducationModalEvents();
  setupCertificationModalEvents();
  setupConsentListeners();

  // City tags events
  const cityInput = document.getElementById('wp-city-input') as HTMLInputElement | null;
  const addCityBtn = document.getElementById('btn-add-pref-city');

  addCityBtn?.addEventListener('click', () => {
    if (cityInput && cityInput.value.trim()) {
      addCityTag(cityInput.value);
      cityInput.value = '';
      cityInput.focus();
    }
  });

  cityInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (cityInput.value.trim()) {
        addCityTag(cityInput.value);
        cityInput.value = '';
      }
    }
  });

  document.querySelectorAll<HTMLButtonElement>('[data-add-city]').forEach(btn => {
    btn.addEventListener('click', () => {
      const city = btn.dataset.addCity;
      if (city) {
        addCityTag(city);
      }
    });
  });

  setupJobModalEvents();
  setupExpOverrideModalEvents();
  setupFamilyModalEvents();
  setupQuestionModalEvents();
  setupStartDaysEvents();

  document.getElementById('btn-new-profile-modal')?.addEventListener('click', () => {
    setVal('profile-name', '');
    setVal('profile-role', '');
    const cloneSelect = document.getElementById('clone-from') as HTMLSelectElement;
    cloneSelect.innerHTML = '<option value="">Start empty</option>';
    for (const p of allProfiles) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `Clone from "${p.name}"`;
      cloneSelect.appendChild(opt);
    }
    renderColorPicker(COLORS[allProfiles.length % COLORS.length]);
    document.getElementById('profile-modal')!.classList.add('active');
  });

  document.getElementById('modal-cancel')?.addEventListener('click', () => {
    document.getElementById('profile-modal')?.classList.remove('active');
  });

  document.getElementById('profile-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = getVal('profile-name');
    if (!name) return;
    const role = getOptVal('profile-role');
    const cloneFrom = getOptVal('clone-from');

    await createProfile(name, role, cloneFrom);
    document.getElementById('profile-modal')?.classList.remove('active');
    await init();
    showToast(`✓ Created profile "${name}"`);
  });
}

function renderColorPicker(selected: string): void {
  const container = document.getElementById('color-picker')!;
  container.innerHTML = '';
  for (const c of COLORS) {
    const el = document.createElement('div');
    el.className = `color-swatch ${c === selected ? 'selected' : ''}`;
    el.style.background = c;
    el.dataset.color = c;
    el.addEventListener('click', () => {
      container.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
      el.classList.add('selected');
    });
    container.appendChild(el);
  }
}

// ── Startup ────────────────────────────────────────────────────────────────

setupTabs();
setupActionButtons();
init().catch(err => console.error('[Profiles] Init error:', err));
