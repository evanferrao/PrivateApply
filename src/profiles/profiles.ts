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

  (document.getElementById('core-first-name') as HTMLInputElement).value = p.firstName || '';
  (document.getElementById('core-middle-name') as HTMLInputElement).value = p.middleName || '';
  (document.getElementById('core-last-name') as HTMLInputElement).value = p.lastName || '';
  (document.getElementById('core-full-name') as HTMLInputElement).value = p.fullName || '';
  (document.getElementById('core-preferred-name') as HTMLInputElement).value = p.preferredName || '';
  (document.getElementById('core-email') as HTMLInputElement).value = p.email || '';

  // Phone - split country code and national number
  const parsedPhone = parsePhoneComponents(p.phone);
  const phoneCcEl = document.getElementById('core-phone-cc') as HTMLInputElement | null;
  const phoneNumEl = document.getElementById('core-phone-num') as HTMLInputElement | null;
  const phoneHiddenEl = document.getElementById('core-phone') as HTMLInputElement | null;
  if (phoneCcEl) phoneCcEl.value = parsedPhone.countryCode;
  if (phoneNumEl) phoneNumEl.value = parsedPhone.number;
  if (phoneHiddenEl) phoneHiddenEl.value = formatPhone(p.phone) || '';

  // Alternate phone
  const parsedAltPhone = parsePhoneComponents(p.alternatePhone);
  const altCcEl = document.getElementById('core-alt-phone-cc') as HTMLInputElement | null;
  const altNumEl = document.getElementById('core-alt-phone-num') as HTMLInputElement | null;
  const altHiddenEl = document.getElementById('core-alternate-phone') as HTMLInputElement | null;
  if (altCcEl) altCcEl.value = parsedAltPhone.countryCode;
  if (altNumEl) altNumEl.value = parsedAltPhone.number;
  if (altHiddenEl) altHiddenEl.value = formatPhone(p.alternatePhone || '') || '';

  (document.getElementById('core-univ-email') as HTMLInputElement).value = p.universityEmail || '';
  (document.getElementById('core-address') as HTMLInputElement).value = formatLocation(p.location) || '';
  (document.getElementById('core-permanent-address') as HTMLInputElement).value = formatLocation(p.permanentAddress || '') || '';
  (document.getElementById('core-nationality') as HTMLInputElement).value = p.nationality || p.citizenship || '';

  (document.getElementById('core-linkedin') as HTMLInputElement).value = prof?.linkedin || '';
  (document.getElementById('core-github') as HTMLInputElement).value = prof?.github || '';
  (document.getElementById('core-portfolio') as HTMLInputElement).value = prof?.portfolio || prof?.website || '';

  // Social Links
  const twitterEl = document.getElementById('core-twitter') as HTMLInputElement | null;
  const youtubeEl = document.getElementById('core-youtube') as HTMLInputElement | null;
  const instagramEl = document.getElementById('core-instagram') as HTMLInputElement | null;
  const facebookEl = document.getElementById('core-facebook') as HTMLInputElement | null;
  const threadsEl = document.getElementById('core-threads') as HTMLInputElement | null;
  const blueskyEl = document.getElementById('core-bluesky') as HTMLInputElement | null;
  const mediumEl = document.getElementById('core-medium') as HTMLInputElement | null;

  if (twitterEl) twitterEl.value = prof?.twitter || '';
  if (youtubeEl) youtubeEl.value = prof?.youtube || '';
  if (instagramEl) instagramEl.value = prof?.instagram || '';
  if (facebookEl) facebookEl.value = prof?.facebook || '';
  if (threadsEl) threadsEl.value = prof?.threads || '';
  if (blueskyEl) blueskyEl.value = prof?.bluesky || '';
  if (mediumEl) mediumEl.value = prof?.medium || '';

  // Passport (Protected Field)
  const pass = activeProfileData.passport;
  const passNumEl = document.getElementById('core-passport-num') as HTMLInputElement | null;
  const passCountryEl = document.getElementById('core-passport-country') as HTMLInputElement | null;
  const passExpiryEl = document.getElementById('core-passport-expiry') as HTMLInputElement | null;
  const passIssueEl = document.getElementById('core-passport-issue-date') as HTMLInputElement | null;
  const passNatEl = document.getElementById('core-passport-nationality') as HTMLInputElement | null;

  if (passNumEl) passNumEl.value = pass?.passportNumber || '';
  if (passCountryEl) passCountryEl.value = pass?.issuingCountry || '';
  if (passExpiryEl) passExpiryEl.value = pass?.expiryDate || '';
  if (passIssueEl) passIssueEl.value = pass?.issueDate || '';
  if (passNatEl) passNatEl.value = pass?.nationality || p.nationality || p.citizenship || '';
}

async function savePersonal(): Promise<void> {
  if (!activeProfileData) return;
  const p = activeProfileData.personal;
  p.firstName = (document.getElementById('core-first-name') as HTMLInputElement).value.trim();
  p.middleName = (document.getElementById('core-middle-name') as HTMLInputElement).value.trim() || undefined;
  p.lastName = (document.getElementById('core-last-name') as HTMLInputElement).value.trim();
  p.fullName = (document.getElementById('core-full-name') as HTMLInputElement).value.trim() || undefined;
  p.preferredName = (document.getElementById('core-preferred-name') as HTMLInputElement).value.trim() || undefined;
  p.email = (document.getElementById('core-email') as HTMLInputElement).value.trim();

  // Save phone as structured PhoneDetails
  const phoneCc = ((document.getElementById('core-phone-cc') as HTMLInputElement)?.value || '+1').trim();
  const phoneNum = ((document.getElementById('core-phone-num') as HTMLInputElement)?.value || '').trim();
  const normalizedCc = phoneCc.startsWith('+') ? phoneCc : `+${phoneCc}`;
  if (phoneNum) {
    p.phone = {
      countryCode: normalizedCc,
      number: phoneNum,
      formatted: `${normalizedCc} ${phoneNum}`,
    };
  } else {
    p.phone = '';
  }

  // Save alternate phone
  const altCc = ((document.getElementById('core-alt-phone-cc') as HTMLInputElement)?.value || '+1').trim();
  const altNum = ((document.getElementById('core-alt-phone-num') as HTMLInputElement)?.value || '').trim();
  const normalizedAltCc = altCc.startsWith('+') ? altCc : `+${altCc}`;
  if (altNum) {
    p.alternatePhone = {
      countryCode: normalizedAltCc,
      number: altNum,
      formatted: `${normalizedAltCc} ${altNum}`,
    };
  } else {
    p.alternatePhone = undefined;
  }

  p.universityEmail = (document.getElementById('core-univ-email') as HTMLInputElement).value.trim() || undefined;
  p.location = (document.getElementById('core-address') as HTMLInputElement).value.trim();
  p.permanentAddress = (document.getElementById('core-permanent-address') as HTMLInputElement).value.trim() || undefined;
  p.nationality = (document.getElementById('core-nationality') as HTMLInputElement).value.trim() || undefined;

  // Also sync passport details from form
  const passNum = (document.getElementById('core-passport-num') as HTMLInputElement)?.value.trim() || '';
  const passCountry = (document.getElementById('core-passport-country') as HTMLInputElement)?.value.trim() || '';
  const passExpiry = (document.getElementById('core-passport-expiry') as HTMLInputElement)?.value || undefined;
  const passIssue = (document.getElementById('core-passport-issue-date') as HTMLInputElement)?.value || undefined;
  const passNat = (document.getElementById('core-passport-nationality') as HTMLInputElement)?.value.trim() || undefined;

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

  await saveUserProfile(activeProfileData);
  showToast('✓ Personal details saved');
}

async function savePassport(): Promise<void> {
  if (!activeProfileData) return;
  const passNum = (document.getElementById('core-passport-num') as HTMLInputElement)?.value.trim() || '';
  const passCountry = (document.getElementById('core-passport-country') as HTMLInputElement)?.value.trim() || '';
  const passExpiry = (document.getElementById('core-passport-expiry') as HTMLInputElement)?.value || undefined;
  const passIssue = (document.getElementById('core-passport-issue-date') as HTMLInputElement)?.value || undefined;
  const passNat = (document.getElementById('core-passport-nationality') as HTMLInputElement)?.value.trim() || undefined;

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

  await saveUserProfile(activeProfileData);
  showToast('✓ Passport details saved (Protected)');
}

async function saveLinks(): Promise<void> {
  if (!activeProfileData) return;
  if (!activeProfileData.professional) activeProfileData.professional = {};
  activeProfileData.professional.linkedin = (document.getElementById('core-linkedin') as HTMLInputElement)?.value.trim() || undefined;
  activeProfileData.professional.github = (document.getElementById('core-github') as HTMLInputElement)?.value.trim() || undefined;
  activeProfileData.professional.portfolio = (document.getElementById('core-portfolio') as HTMLInputElement)?.value.trim() || undefined;

  // Social Links
  activeProfileData.professional.twitter = (document.getElementById('core-twitter') as HTMLInputElement)?.value.trim() || undefined;
  activeProfileData.professional.youtube = (document.getElementById('core-youtube') as HTMLInputElement)?.value.trim() || undefined;
  activeProfileData.professional.instagram = (document.getElementById('core-instagram') as HTMLInputElement)?.value.trim() || undefined;
  activeProfileData.professional.facebook = (document.getElementById('core-facebook') as HTMLInputElement)?.value.trim() || undefined;
  activeProfileData.professional.threads = (document.getElementById('core-threads') as HTMLInputElement)?.value.trim() || undefined;
  activeProfileData.professional.bluesky = (document.getElementById('core-bluesky') as HTMLInputElement)?.value.trim() || undefined;
  activeProfileData.professional.medium = (document.getElementById('core-medium') as HTMLInputElement)?.value.trim() || undefined;

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
  (document.getElementById('edu-modal-title-input') as HTMLInputElement).value = '';
  (document.getElementById('edu-modal-school') as HTMLInputElement).value = '';
  (document.getElementById('edu-modal-score') as HTMLInputElement).value = '';
  (document.getElementById('edu-modal-year') as HTMLInputElement).value = '';
  (document.getElementById('edu-modal-level') as HTMLSelectElement).value = 'undergraduate';
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

    const level = (document.getElementById('edu-modal-level') as HTMLSelectElement).value;
    const title = (document.getElementById('edu-modal-title-input') as HTMLInputElement).value.trim();
    const school = (document.getElementById('edu-modal-school') as HTMLInputElement).value.trim();
    const score = (document.getElementById('edu-modal-score') as HTMLInputElement).value.trim();
    const year = (document.getElementById('edu-modal-year') as HTMLInputElement).value.trim();

    const rec: EducationRecord = {
      id: `edu_${Date.now()}`,
      level: level as any,
      qualificationTitle: title,
      schoolOrInstitution: school,
      scoreValue: score,
      yearOfPassing: year,
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
  const idInput = document.getElementById('cert-modal-id') as HTMLInputElement;
  const nameInput = document.getElementById('cert-modal-name') as HTMLInputElement;
  const issuerInput = document.getElementById('cert-modal-issuer') as HTMLInputElement;
  const examInput = document.getElementById('cert-modal-exam-code') as HTMLInputElement;
  const credIdInput = document.getElementById('cert-modal-credential-id') as HTMLInputElement;
  const scoreInput = document.getElementById('cert-modal-score') as HTMLInputElement;
  const urlInput = document.getElementById('cert-modal-verification-url') as HTMLInputElement;
  const issueInput = document.getElementById('cert-modal-issue-date') as HTMLInputElement;
  const expiryInput = document.getElementById('cert-modal-expiry-date') as HTMLInputElement;
  const noExpireCheckbox = document.getElementById('cert-modal-no-expire') as HTMLInputElement;
  const skillsInput = document.getElementById('cert-modal-skills') as HTMLInputElement;
  const titleEl = document.getElementById('cert-modal-title');

  if (certId && activeProfileData?.certifications) {
    const existing = activeProfileData.certifications.find(c => c.id === certId);
    if (existing) {
      if (titleEl) titleEl.textContent = 'Edit Certification / License';
      idInput.value = existing.id;
      nameInput.value = existing.name;
      issuerInput.value = existing.issuer;
      examInput.value = existing.examCode || '';
      credIdInput.value = existing.credentialId || '';
      scoreInput.value = existing.scoreOrGrade || '';
      urlInput.value = existing.verificationUrl || '';
      issueInput.value = existing.issueDate || '';
      expiryInput.value = existing.expiryDate || '';
      noExpireCheckbox.checked = Boolean(existing.doesNotExpire);
      expiryInput.disabled = Boolean(existing.doesNotExpire);
      skillsInput.value = (existing.skillsCovered || []).join(', ');
      currentCertModalAliases = [...(existing.issuerAliases || [])];
      renderCertModalAliases();
      modal.classList.add('active');
      return;
    }
  }

  if (titleEl) titleEl.textContent = 'Add Certification / License';
  idInput.value = '';
  nameInput.value = '';
  issuerInput.value = '';
  examInput.value = '';
  credIdInput.value = '';
  scoreInput.value = '';
  urlInput.value = '';
  issueInput.value = '';
  expiryInput.value = '';
  expiryInput.disabled = false;
  noExpireCheckbox.checked = false;
  skillsInput.value = '';
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

    const idInput = (document.getElementById('cert-modal-id') as HTMLInputElement).value.trim();
    const name = (document.getElementById('cert-modal-name') as HTMLInputElement).value.trim();
    const issuer = (document.getElementById('cert-modal-issuer') as HTMLInputElement).value.trim();
    const examCode = (document.getElementById('cert-modal-exam-code') as HTMLInputElement).value.trim() || undefined;
    const credentialId = (document.getElementById('cert-modal-credential-id') as HTMLInputElement).value.trim() || undefined;
    const scoreOrGrade = (document.getElementById('cert-modal-score') as HTMLInputElement).value.trim() || undefined;
    const verificationUrl = (document.getElementById('cert-modal-verification-url') as HTMLInputElement).value.trim() || undefined;
    const issueDate = (document.getElementById('cert-modal-issue-date') as HTMLInputElement).value.trim();
    const doesNotExpire = Boolean(noExpireCheckbox?.checked);
    const expiryDate = doesNotExpire ? undefined : ((document.getElementById('cert-modal-expiry-date') as HTMLInputElement).value.trim() || undefined);
    const rawSkills = (document.getElementById('cert-modal-skills') as HTMLInputElement).value.trim();
    const skillsCovered = rawSkills ? rawSkills.split(',').map(s => s.trim()).filter(Boolean) : undefined;

    if (aliasInput && aliasInput.value.trim()) {
      addCertAliasFromInput();
    }

    const certRecord: CertificationRecord = {
      id: idInput || `cert_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      issuer,
      issuerAliases: [...currentCertModalAliases],
      examCode,
      credentialId,
      verificationUrl,
      issueDate,
      expiryDate,
      doesNotExpire,
      scoreOrGrade,
      skillsCovered,
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

  const notice = parseInt((document.getElementById('comp-notice-days') as HTMLInputElement).value, 10);
  const currentCtc = parseFloat((document.getElementById('comp-current-ctc') as HTMLInputElement).value);
  const expCtc = parseFloat((document.getElementById('comp-expected-ctc') as HTMLInputElement).value);
  const curr = (document.getElementById('comp-currency') as HTMLSelectElement).value;
  const neg = (document.getElementById('comp-negotiable') as HTMLSelectElement).value === 'true';
  const pref = (document.getElementById('comp-work-pref') as HTMLSelectElement).value as any;

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
  const editIdxInput = document.getElementById('job-edit-idx') as HTMLInputElement;
  const typeSelect = document.getElementById('job-type') as HTMLSelectElement;
  const companyInput = document.getElementById('job-company') as HTMLInputElement;
  const titleInput = document.getElementById('job-title') as HTMLInputElement;
  const startInput = document.getElementById('job-start') as HTMLInputElement;
  const endInput = document.getElementById('job-end') as HTMLInputElement;
  const currentCheckbox = document.getElementById('job-current') as HTMLInputElement;
  const countsCheckbox = document.getElementById('job-counts-exp') as HTMLInputElement;

  if (!modal) return;

  if (idx !== undefined && idx >= 0 && activeProfileData?.employmentHistory?.[idx]) {
    const job = activeProfileData.employmentHistory[idx];
    if (titleEl) titleEl.textContent = 'Edit Record';
    editIdxInput.value = String(idx);
    typeSelect.value = job.employmentType || 'full_time';
    companyInput.value = job.employerName || '';
    titleInput.value = job.jobTitle || '';
    startInput.value = job.startDate || '';
    endInput.value = job.endDate || '';
    currentCheckbox.checked = Boolean(job.currentlyEmployed);
    countsCheckbox.checked = job.countsTowardsExperience !== false;
  } else {
    if (titleEl) titleEl.textContent = defaultType === 'internship' ? 'Add Internship' : 'Add Employment';
    editIdxInput.value = '-1';
    typeSelect.value = defaultType;
    companyInput.value = '';
    titleInput.value = '';
    startInput.value = '';
    endInput.value = '';
    currentCheckbox.checked = false;
    // Default: internships and open-source roles do not count towards work experience by default
    countsCheckbox.checked = defaultType !== 'internship' && defaultType !== 'open_source';
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
  const editIdxInput = document.getElementById('job-edit-idx') as HTMLInputElement;

  cancelBtn?.addEventListener('click', closeJobModal);
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeJobModal();
  });

  typeSelect?.addEventListener('change', () => {
    // If adding a new record, automatically adjust counts checkbox based on selected type
    if (editIdxInput.value === '-1') {
      const selectedType = typeSelect.value;
      countsCheckbox.checked = selectedType !== 'internship' && selectedType !== 'open_source';
    }
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!activeProfileData) return;
    if (!activeProfileData.employmentHistory) activeProfileData.employmentHistory = [];

    const idx = parseInt(editIdxInput.value, 10);
    const type = typeSelect.value as DetailedEmploymentRecord['employmentType'];
    const company = (document.getElementById('job-company') as HTMLInputElement).value.trim();
    const title = (document.getElementById('job-title') as HTMLInputElement).value.trim();
    const start = (document.getElementById('job-start') as HTMLInputElement).value.trim();
    const current = (document.getElementById('job-current') as HTMLInputElement).checked;
    const end = current ? undefined : (document.getElementById('job-end') as HTMLInputElement).value.trim() || undefined;
    const counts = countsCheckbox.checked;

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
  (document.getElementById('override-total-exp') as HTMLInputElement).value = String(
    overrides?.totalExperienceYears ?? derived.totalExperienceYears
  );
  (document.getElementById('override-fulltime-exp') as HTMLInputElement).value = String(
    overrides?.fullTimeYears ?? derived.fullTimeYears
  );
  (document.getElementById('override-tenure') as HTMLInputElement).value = String(
    overrides?.currentEmployerTenureYears ?? derived.currentEmployerTenureYears
  );
  (document.getElementById('override-employers') as HTMLInputElement).value = String(
    overrides?.totalEmployersCount ?? derived.totalEmployersCount
  );
  (document.getElementById('override-display-text') as HTMLInputElement).value =
    overrides?.displayTotalExperience ?? (derived.isOverridden ? derived.displayTotalExperience : '');

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
    (document.getElementById('override-total-exp') as HTMLInputElement).value = '0';
    (document.getElementById('override-fulltime-exp') as HTMLInputElement).value = '0';
    (document.getElementById('override-tenure') as HTMLInputElement).value = '0';
    (document.getElementById('override-employers') as HTMLInputElement).value = '0';
    (document.getElementById('override-display-text') as HTMLInputElement).value = '0 years (Fresher)';
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

    const total = parseFloat((document.getElementById('override-total-exp') as HTMLInputElement).value);
    const ft = parseFloat((document.getElementById('override-fulltime-exp') as HTMLInputElement).value);
    const tenure = parseFloat((document.getElementById('override-tenure') as HTMLInputElement).value);
    const emps = parseInt((document.getElementById('override-employers') as HTMLInputElement).value, 10);
    const customDisplay = (document.getElementById('override-display-text') as HTMLInputElement).value.trim();

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
  (document.getElementById('wp-type-remote') as HTMLInputElement).checked = types.includes('remote');
  (document.getElementById('wp-type-hybrid') as HTMLInputElement).checked = types.includes('hybrid');
  (document.getElementById('wp-type-onsite') as HTMLInputElement).checked = types.includes('onsite');
  (document.getElementById('wp-type-flexible') as HTMLInputElement).checked = types.includes('flexible');

  currentPreferredLocations = [...(wp.preferredLocations || [])];
  renderCityTags();

  // Relocation
  const relocateVal = typeof wp.willingToRelocate === 'boolean' 
    ? (wp.willingToRelocate ? 'true' : 'false') 
    : (wp.willingToRelocate || 'false');
  (document.getElementById('wp-relocate') as HTMLSelectElement).value = String(relocateVal);
  (document.getElementById('wp-relocate-assist') as HTMLInputElement).checked = Boolean(wp.relocationAssistanceRequired);

  // Travel
  (document.getElementById('wp-travel-willing') as HTMLInputElement).checked = Boolean(wp.willingToTravel);
  (document.getElementById('wp-travel-pct') as HTMLInputElement).value = String(wp.travelPercentage ?? '');

  // Earliest start (numeric days)
  const startDays = wp.earliestStartDays !== undefined 
    ? wp.earliestStartDays 
    : (wp.earliestStartDate && !isNaN(parseInt(wp.earliestStartDate, 10)) ? parseInt(wp.earliestStartDate, 10) : 0);
  const startDaysEl = document.getElementById('wp-earliest-start-days') as HTMLInputElement | null;
  if (startDaysEl) startDaysEl.value = String(startDays);
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
  (document.getElementById('wp-overtime') as HTMLInputElement).checked = Boolean(wp.overtimeWilling);

  // Targets
  (document.getElementById('wp-target-roles') as HTMLInputElement).value = (wp.targetRoleTitles || []).join(', ');
  (document.getElementById('wp-target-industries') as HTMLInputElement).value = (wp.targetIndustries || []).join(', ');

  // Salary
  (document.getElementById('wp-min-salary') as HTMLInputElement).value = String(wp.minimumAcceptableSalary ?? '');
  (document.getElementById('wp-target-salary') as HTMLInputElement).value = String(wp.targetSalary ?? '');
  (document.getElementById('wp-salary-currency') as HTMLSelectElement).value = wp.salaryCurrency || 'USD';
  (document.getElementById('wp-salary-period') as HTMLSelectElement).value = wp.salaryPeriod || 'annual';

  // Notes
  (document.getElementById('wp-notes') as HTMLTextAreaElement).value = wp.notes || '';
}

async function saveWorkPreferences(): Promise<void> {
  if (!activeProfileData) return;
  if (!activeProfileData.workPreferences) {
    activeProfileData.workPreferences = createDefaultWorkPreferences();
  }
  const wp = activeProfileData.workPreferences;

  const types: Array<'remote' | 'hybrid' | 'onsite' | 'flexible'> = [];
  if ((document.getElementById('wp-type-remote') as HTMLInputElement).checked) types.push('remote');
  if ((document.getElementById('wp-type-hybrid') as HTMLInputElement).checked) types.push('hybrid');
  if ((document.getElementById('wp-type-onsite') as HTMLInputElement).checked) types.push('onsite');
  if ((document.getElementById('wp-type-flexible') as HTMLInputElement).checked) types.push('flexible');
  wp.workplaceTypes = types;

  wp.preferredLocations = [...currentPreferredLocations];

  const relocVal = (document.getElementById('wp-relocate') as HTMLSelectElement).value;
  wp.willingToRelocate = relocVal === 'true' ? true : relocVal === 'false' ? false : (relocVal as any);
  wp.relocationAssistanceRequired = (document.getElementById('wp-relocate-assist') as HTMLInputElement).checked;

  wp.willingToTravel = (document.getElementById('wp-travel-willing') as HTMLInputElement).checked;
  const travelPct = parseInt((document.getElementById('wp-travel-pct') as HTMLInputElement).value, 10);
  wp.travelPercentage = isNaN(travelPct) ? undefined : travelPct;

  const startDaysInput = document.getElementById('wp-earliest-start-days') as HTMLInputElement | null;
  const startDaysVal = startDaysInput ? parseInt(startDaysInput.value, 10) : 0;
  wp.earliestStartDays = isNaN(startDaysVal) ? 0 : Math.max(0, startDaysVal);
  wp.earliestStartDate = wp.earliestStartDays === 0 ? 'Immediately' : `${wp.earliestStartDays} days`;

  const empTypes: Array<any> = [];
  document.querySelectorAll<HTMLInputElement>('.wp-emp-type:checked').forEach(cb => {
    empTypes.push(cb.value);
  });
  wp.employmentTypes = empTypes;

  const shifts: Array<any> = [];
  document.querySelectorAll<HTMLInputElement>('.wp-shift:checked').forEach(cb => {
    shifts.push(cb.value);
  });
  wp.shiftPreferences = shifts;
  wp.overtimeWilling = (document.getElementById('wp-overtime') as HTMLInputElement).checked;

  const rolesStr = (document.getElementById('wp-target-roles') as HTMLInputElement).value.trim();
  wp.targetRoleTitles = rolesStr ? rolesStr.split(',').map(s => s.trim()).filter(Boolean) : [];

  const indStr = (document.getElementById('wp-target-industries') as HTMLInputElement).value.trim();
  wp.targetIndustries = indStr ? indStr.split(',').map(s => s.trim()).filter(Boolean) : [];

  const minSal = parseFloat((document.getElementById('wp-min-salary') as HTMLInputElement).value);
  wp.minimumAcceptableSalary = isNaN(minSal) ? undefined : minSal;

  const tgtSal = parseFloat((document.getElementById('wp-target-salary') as HTMLInputElement).value);
  wp.targetSalary = isNaN(tgtSal) ? undefined : tgtSal;

  wp.salaryCurrency = (document.getElementById('wp-salary-currency') as HTMLSelectElement).value;
  wp.salaryPeriod = (document.getElementById('wp-salary-period') as HTMLSelectElement).value as any;
  wp.notes = (document.getElementById('wp-notes') as HTMLTextAreaElement).value.trim() || undefined;

  await saveUserProfile(activeProfileData);
  showToast('✓ Work Preferences saved');
}

// ── Screening & Legal Disclosures ──────────────────────────────────────────

function populateScreeningForm(): void {
  if (!activeProfileData) return;
  const scr = activeProfileData.legalDisclosures || createDefaultLegalAndDisclosures();

  (document.getElementById('scr-over-18') as HTMLSelectElement).value = scr.over18 ? 'true' : 'false';
  (document.getElementById('scr-authorized') as HTMLSelectElement).value = scr.legallyAuthorized ? 'true' : 'false';
  (document.getElementById('scr-sponsorship') as HTMLSelectElement).value = scr.requiresSponsorship ? 'true' : 'false';

  (document.getElementById('scr-visa-status') as HTMLSelectElement).value = scr.visaStatus || 'US Citizen / Permanent Resident';
  (document.getElementById('scr-sponsorship-timeline') as HTMLSelectElement).value = scr.sponsorshipTimeline || 'Not in foreseeable future';

  (document.getElementById('scr-opt-stem') as HTMLInputElement).checked = Boolean(scr.optStemEligible);
  (document.getElementById('scr-opt-months') as HTMLInputElement).value = String(scr.optMonthsRemaining ?? '');

  (document.getElementById('scr-clearance') as HTMLSelectElement).value = scr.securityClearance || 'none';
  (document.getElementById('scr-itar') as HTMLSelectElement).value = scr.itarCompliant ? 'true' : 'false';

  (document.getElementById('scr-driver-license') as HTMLInputElement).checked = Boolean(scr.hasValidDriverLicense);
  (document.getElementById('scr-driver-state') as HTMLInputElement).value = scr.driverLicenseState || '';
  (document.getElementById('scr-clean-driving') as HTMLInputElement).checked = Boolean(scr.hasCleanDrivingRecord);

  (document.getElementById('scr-prev-employed') as HTMLSelectElement).value = scr.previouslyEmployedAtCompany ? 'true' : 'false';
  (document.getElementById('scr-prev-employed-details') as HTMLInputElement).value = scr.previousEmploymentDetails || '';

  (document.getElementById('scr-relatives') as HTMLSelectElement).value = scr.hasRelativesAtCompany ? 'true' : 'false';
  (document.getElementById('scr-relatives-details') as HTMLInputElement).value = scr.relativesDetails || '';

  (document.getElementById('scr-noncompete') as HTMLSelectElement).value = scr.hasNonCompeteOrRestrictions ? 'true' : 'false';
  (document.getElementById('scr-noncompete-details') as HTMLInputElement).value = scr.nonCompeteDetails || '';

  (document.getElementById('scr-bg-check') as HTMLSelectElement).value = scr.backgroundCheckConsent ? 'true' : 'false';
  (document.getElementById('scr-drug-screen') as HTMLSelectElement).value = scr.drugScreeningConsent ? 'true' : 'false';

  (document.getElementById('scr-referral-source') as HTMLSelectElement).value = scr.referralSource || 'LinkedIn';
  (document.getElementById('scr-referrer-name') as HTMLInputElement).value = scr.referrerName || '';
  (document.getElementById('scr-referrer-email') as HTMLInputElement).value = scr.referrerEmail || '';

  // Consents & Authorizations
  const setCheck = (id: string, val: boolean | undefined) => {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (el) el.checked = val !== false;
  };
  setCheck('scr-consent-whatsapp', scr.consentWhatsApp);
  setCheck('scr-consent-sms', scr.consentSms);
  setCheck('scr-consent-phone-calls', scr.consentPhoneCalls);
  setCheck('scr-consent-dnc-bypass', scr.consentDncBypass);
  setCheck('scr-consent-future-opps', scr.consentFutureOpportunities);
  setCheck('scr-consent-talent-sharing', scr.consentTalentPoolSharing);
  setCheck('scr-consent-bg-check', scr.backgroundCheckConsent);
  setCheck('scr-consent-ref-check', scr.consentReferenceCheck);
  setCheck('scr-consent-drug-screen', scr.drugScreeningConsent);
  setCheck('scr-consent-credit-check', scr.consentCreditCheck);
  setCheck('scr-consent-privacy', scr.consentPrivacyPolicy);
  setCheck('scr-consent-data-transfer', scr.consentDataTransfer);
  setCheck('scr-consent-terms', scr.consentTermsOfService);
  setCheck('scr-consent-esign', scr.consentElectronicSignature);
  setCheck('scr-consent-truth', scr.consentAccurateInformation);
  setCheck('scr-consent-at-will', scr.consentAtWillEmployment);
  setCheck('scr-consent-ai', scr.consentArtificialIntelligence);
  setCheck('scr-consent-eeo', scr.consentEqualOpportunity);
}

async function saveScreening(): Promise<void> {
  if (!activeProfileData) return;
  if (!activeProfileData.legalDisclosures) {
    activeProfileData.legalDisclosures = createDefaultLegalAndDisclosures();
  }
  const scr = activeProfileData.legalDisclosures;

  scr.over18 = (document.getElementById('scr-over-18') as HTMLSelectElement).value === 'true';
  scr.legallyAuthorized = (document.getElementById('scr-authorized') as HTMLSelectElement).value === 'true';
  scr.requiresSponsorship = (document.getElementById('scr-sponsorship') as HTMLSelectElement).value === 'true';

  scr.visaStatus = (document.getElementById('scr-visa-status') as HTMLSelectElement).value;
  scr.sponsorshipTimeline = (document.getElementById('scr-sponsorship-timeline') as HTMLSelectElement).value;

  scr.optStemEligible = (document.getElementById('scr-opt-stem') as HTMLInputElement).checked;
  const optMonths = parseInt((document.getElementById('scr-opt-months') as HTMLInputElement).value, 10);
  scr.optMonthsRemaining = isNaN(optMonths) ? undefined : optMonths;

  scr.securityClearance = (document.getElementById('scr-clearance') as HTMLSelectElement).value as any;
  scr.itarCompliant = (document.getElementById('scr-itar') as HTMLSelectElement).value === 'true';

  scr.hasValidDriverLicense = (document.getElementById('scr-driver-license') as HTMLInputElement).checked;
  scr.driverLicenseState = (document.getElementById('scr-driver-state') as HTMLInputElement).value.trim() || undefined;
  scr.hasCleanDrivingRecord = (document.getElementById('scr-clean-driving') as HTMLInputElement).checked;

  scr.previouslyEmployedAtCompany = (document.getElementById('scr-prev-employed') as HTMLSelectElement).value === 'true';
  scr.previousEmploymentDetails = (document.getElementById('scr-prev-employed-details') as HTMLInputElement).value.trim() || undefined;

  scr.hasRelativesAtCompany = (document.getElementById('scr-relatives') as HTMLSelectElement).value === 'true';
  scr.relativesDetails = (document.getElementById('scr-relatives-details') as HTMLInputElement).value.trim() || undefined;

  scr.hasNonCompeteOrRestrictions = (document.getElementById('scr-noncompete') as HTMLSelectElement).value === 'true';
  scr.nonCompeteDetails = (document.getElementById('scr-noncompete-details') as HTMLInputElement).value.trim() || undefined;

  scr.referralSource = (document.getElementById('scr-referral-source') as HTMLSelectElement).value;
  scr.referrerName = (document.getElementById('scr-referrer-name') as HTMLInputElement).value.trim() || undefined;
  scr.referrerEmail = (document.getElementById('scr-referrer-email') as HTMLInputElement).value.trim() || undefined;

  // Consents & Authorizations
  const getCheck = (id: string, defVal = true) => {
    const el = document.getElementById(id) as HTMLInputElement | null;
    return el ? el.checked : defVal;
  };
  scr.consentWhatsApp = getCheck('scr-consent-whatsapp');
  scr.consentSms = getCheck('scr-consent-sms');
  scr.consentPhoneCalls = getCheck('scr-consent-phone-calls');
  scr.consentDncBypass = getCheck('scr-consent-dnc-bypass');
  scr.consentFutureOpportunities = getCheck('scr-consent-future-opps');
  scr.consentTalentPoolSharing = getCheck('scr-consent-talent-sharing');
  scr.backgroundCheckConsent = getCheck('scr-consent-bg-check', scr.backgroundCheckConsent ?? true);
  scr.consentReferenceCheck = getCheck('scr-consent-ref-check');
  scr.drugScreeningConsent = getCheck('scr-consent-drug-screen', scr.drugScreeningConsent ?? true);
  scr.consentCreditCheck = getCheck('scr-consent-credit-check');
  scr.consentPrivacyPolicy = getCheck('scr-consent-privacy');
  scr.consentDataTransfer = getCheck('scr-consent-data-transfer');
  scr.consentTermsOfService = getCheck('scr-consent-terms');
  scr.consentElectronicSignature = getCheck('scr-consent-esign');
  scr.consentAccurateInformation = getCheck('scr-consent-truth');
  scr.consentAtWillEmployment = getCheck('scr-consent-at-will');
  scr.consentArtificialIntelligence = getCheck('scr-consent-ai');
  scr.consentEqualOpportunity = getCheck('scr-consent-eeo');

  // Sync existing legacy dropdowns if present
  if (document.getElementById('scr-bg-check')) {
    (document.getElementById('scr-bg-check') as HTMLSelectElement).value = scr.backgroundCheckConsent ? 'true' : 'false';
  }
  if (document.getElementById('scr-drug-screen')) {
    (document.getElementById('scr-drug-screen') as HTMLSelectElement).value = scr.drugScreeningConsent ? 'true' : 'false';
  }

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
  (document.getElementById('family-modal-rel') as HTMLSelectElement).value = 'father';
  (document.getElementById('family-modal-name') as HTMLInputElement).value = '';
  (document.getElementById('family-modal-phone-cc') as HTMLInputElement).value = '+1';
  (document.getElementById('family-modal-phone-num') as HTMLInputElement).value = '';
  (document.getElementById('family-modal-occ') as HTMLInputElement).value = '';
  (document.getElementById('family-modal-email') as HTMLInputElement).value = '';
  (document.getElementById('family-modal-emergency') as HTMLInputElement).checked = false;
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

    const rel = (document.getElementById('family-modal-rel') as HTMLSelectElement).value;
    const name = (document.getElementById('family-modal-name') as HTMLInputElement).value.trim();
    const phoneCc = ((document.getElementById('family-modal-phone-cc') as HTMLInputElement).value || '+1').trim();
    const phoneNum = (document.getElementById('family-modal-phone-num') as HTMLInputElement).value.trim();
    const occ = (document.getElementById('family-modal-occ') as HTMLInputElement).value.trim();
    const email = (document.getElementById('family-modal-email') as HTMLInputElement).value.trim();
    const isEmergency = (document.getElementById('family-modal-emergency') as HTMLInputElement).checked || rel === 'emergency';

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
      occupation: occ || undefined,
      email: email || undefined,
      isEmergencyContact: isEmergency,
    };

    activeProfileData.familyContacts.push(contact);
    await saveUserProfile(activeProfileData);
    closeFamilyModal();
    populateFamilyList();
    showToast('✓ Family contact added');
  });
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

  // Ensure countryPacksData exists
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
    const packCard = document.createElement('div');
    packCard.className = 'country-pack-hub-card';
    packCard.dataset.packId = pack.id;
    packCard.style.cssText = 'margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid var(--border-color);';

    const flag = pack.icon || '🌐';
    const name = pack.countryName;
    const pId = pack.id;
    const desc = pack.description || '';
    const storedPackData = activeProfileData?.countryPacksData?.[pack.id] || {};

    let fieldsHtml = '';
    pack.fields.forEach(f => {
      const fieldId = `cp_${pack.id.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${f.key}`;
      const curVal = storedPackData[f.key] ?? f.defaultValue ?? '';
      
      let sensBadge = '';
      if (f.sensitivity === 'restricted_identifier') {
        sensBadge = '<span class="badge-sens restricted" style="margin-left: 6px;">Restricted</span>';
      } else if (f.sensitivity === 'sensitive_personal') {
        sensBadge = '<span class="badge-sens sensitive" style="margin-left: 6px;">Sensitive</span>';
      }

      let inputHtml = '';
      if (f.dataType === 'choice') {
        const opts = (f.options || []).map(opt => {
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

      fieldsHtml += `
        <div class="field-group">
          <label style="display: flex; align-items: center; justify-content: space-between;">
            <span>${f.label}</span>
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
          <span style="font-size: 22px;">${flag}</span>
          <div>
            <h3 style="font-size: 15px; font-weight: 700; color: var(--text-primary); margin: 0;">${name} <span style="font-size: 12px; font-weight: 600; color: var(--text-muted); margin-left: 6px;">(${pId})</span></h3>
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

    container.appendChild(packCard);
  });
}

async function saveCountryPacks(): Promise<void> {
  if (!activeProfileData) return;
  if (!activeProfileData.countryPacksData) {
    activeProfileData.countryPacksData = {};
  }

  const container = document.getElementById('country-packs-hub-container');
  if (!container) return;

  const packCards = container.querySelectorAll('.country-pack-hub-card');
  packCards.forEach(card => {
    const pId = (card as HTMLElement).dataset.packId!;
    const packObj: Record<string, any> = {};

    const inputs = card.querySelectorAll('[data-field-key]');
    inputs.forEach(inputEl => {
      const key = (inputEl as HTMLElement).dataset.fieldKey!;
      let val: any;
      if (inputEl instanceof HTMLInputElement) {
        if (inputEl.type === 'number') {
          val = inputEl.value !== '' ? parseFloat(inputEl.value) : undefined;
        } else {
          val = inputEl.value.trim() || undefined;
        }
      } else if (inputEl instanceof HTMLSelectElement) {
        if (inputEl.value === 'true') val = true;
        else if (inputEl.value === 'false') val = false;
        else val = inputEl.value;
      }
      if (val !== undefined) {
        packObj[key] = val;
      }
    });

    activeProfileData!.countryPacksData![pId] = packObj;

    // Sync back to legacy indiaPack for full backwards compatibility
    if (pId === 'IN-pack') {
      if (!activeProfileData!.indiaPack) {
        activeProfileData!.indiaPack = createDefaultIndiaPack();
      }
      const ip = activeProfileData!.indiaPack;
      ip.enabled = true;
      ip.tenthPercentage = packObj.tenth_percentage;
      ip.tenthPassingYear = packObj.tenth_passing_year;
      ip.tenthBoard = packObj.tenth_board;
      ip.twelfthPercentage = packObj.twelfth_percentage;
      ip.twelfthPassingYear = packObj.twelfth_passing_year;
      ip.twelfthBoard = packObj.twelfth_board;
      ip.undergradCgpa = packObj.undergrad_cgpa;
      ip.cgpaConversionFormula = packObj.cgpa_conversion_formula;
      ip.studentRegistrationNumber = packObj.student_registration_number;
      ip.activeBacklogsCount = packObj.active_backlogs ?? 0;
      ip.clearedBacklogsCount = packObj.history_of_backlogs ?? 0;
      ip.educationGapYears = packObj.academic_gap_years ?? 0;
      ip.currentCtcLpa = packObj.current_ctc_lpa;
      ip.expectedCtcLpa = packObj.expected_ctc_lpa;
      ip.willingToSignBond = Boolean(packObj.willing_to_sign_bond);
      ip.aadhaarNumberMasked = packObj.aadhaar_number;
      ip.panNumberMasked = packObj.pan_number;
      ip.dayScholarOrHosteller = packObj.day_scholar_or_hosteller;
    }
  });

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
    const packCard = document.createElement('div');
    packCard.className = 'employment-pack-hub-card';
    packCard.dataset.packId = pack.id;
    packCard.style.cssText = 'margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid var(--border-color);';

    const icon = pack.icon || '💼';
    const name = pack.name;
    const pId = pack.id;
    const desc = pack.description || '';
    const storedPackData = activeProfileData?.employmentPacksData?.[pack.id] || {};

    let fieldsHtml = '';
    pack.fields.forEach(f => {
      const fieldId = `ep_${pack.id.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${f.key}`;
      const curVal = storedPackData[f.key] ?? f.defaultValue ?? '';

      let sensBadge = '';
      if (f.sensitivity === 'restricted_identifier') {
        sensBadge = '<span class="badge-sens restricted" style="margin-left: 6px;">Restricted</span>';
      } else if (f.sensitivity === 'sensitive_personal') {
        sensBadge = '<span class="badge-sens sensitive" style="margin-left: 6px;">Sensitive</span>';
      }

      let inputHtml = '';
      if (f.dataType === 'choice') {
        const opts = (f.options || []).map(opt => {
          const sel = String(curVal) === String(opt) ? 'selected' : '';
          const optLabel = opt.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
          return `<option value="${opt}" ${sel}>${optLabel}</option>`;
        }).join('');
        inputHtml = `<select id="${fieldId}" data-field-key="${f.key}" class="field-select">${opts}</select>`;
      } else if (f.dataType === 'number') {
        inputHtml = `<input type="number" step="any" id="${fieldId}" data-field-key="${f.key}" class="field-input" placeholder="${f.placeholder || ''}" value="${curVal !== '' ? curVal : ''}">`;
      } else if (f.dataType === 'textarea') {
        inputHtml = `<textarea id="${fieldId}" data-field-key="${f.key}" class="field-input" style="min-height: 70px;" placeholder="${f.placeholder || ''}">${curVal || ''}</textarea>`;
      } else if (f.dataType === 'url') {
        inputHtml = `
          <div style="display: flex; gap: 6px;">
            <input type="url" id="${fieldId}" data-field-key="${f.key}" class="field-input" placeholder="${f.placeholder || ''}" value="${curVal || ''}" style="flex: 1;">
            ${curVal ? `<button type="button" class="btn-copy-url" data-url="${curVal}" style="padding: 6px 10px; font-size: 11px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-card); cursor: pointer;" title="Copy URL">📋</button>` : ''}
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
            <h3 style="font-size: 15px; font-weight: 700; color: var(--text-primary); margin: 0;">${name} <span style="font-size: 12px; font-weight: 600; color: var(--text-muted); margin-left: 6px;">(${pId})</span></h3>
            <p style="font-size: 12px; color: var(--text-muted); margin: 2px 0 0 0;">${desc}</p>
          </div>
        </div>
        <span class="badge-sens" style="background: var(--bg-muted); color: var(--text-muted); font-size: 11px; font-weight: 600;">${pack.fields.length} Fields</span>
      </div>
      <div class="form-grid-3">
        ${fieldsHtml}
      </div>
    `;

    // Copy URL helper
    packCard.querySelectorAll('.btn-copy-url').forEach(btn => {
      btn.addEventListener('click', () => {
        const urlToCopy = (btn as HTMLElement).dataset.url;
        if (urlToCopy) {
          navigator.clipboard.writeText(urlToCopy);
          showToast('Copied link to clipboard');
        }
      });
    });

    container.appendChild(packCard);
  });
}

async function saveEmploymentPacks(): Promise<void> {
  if (!activeProfileData) return;
  if (!activeProfileData.employmentPacksData) {
    activeProfileData.employmentPacksData = {};
  }

  const container = document.getElementById('employment-packs-hub-container');
  if (!container) return;

  const packCards = container.querySelectorAll('.employment-pack-hub-card');
  packCards.forEach(card => {
    const pId = (card as HTMLElement).dataset.packId!;
    const packObj: Record<string, any> = {};

    const inputs = card.querySelectorAll('[data-field-key]');
    inputs.forEach(inputEl => {
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
        val = inputEl.value;
      }
      if (val !== undefined) {
        packObj[key] = val;
      }
    });

    activeProfileData!.employmentPacksData![pId] = packObj;
  });

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
  (document.getElementById('qb-modal-category') as HTMLSelectElement).value = 'screening';
  (document.getElementById('qb-modal-question') as HTMLInputElement).value = '';
  (document.getElementById('qb-modal-aliases') as HTMLInputElement).value = '';
  (document.getElementById('qb-modal-answer') as HTMLTextAreaElement).value = '';
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

    const category = (document.getElementById('qb-modal-category') as HTMLSelectElement).value;
    const q = (document.getElementById('qb-modal-question') as HTMLInputElement).value.trim();
    const aliasesStr = (document.getElementById('qb-modal-aliases') as HTMLInputElement).value.trim();
    const a = (document.getElementById('qb-modal-answer') as HTMLTextAreaElement).value.trim();

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
  setupEducationModalEvents();
  setupFamilyModalEvents();
  setupQuestionModalEvents();
  setupStartDaysEvents();

  document.getElementById('btn-new-profile-modal')?.addEventListener('click', () => {
    (document.getElementById('profile-name') as HTMLInputElement).value = '';
    (document.getElementById('profile-role') as HTMLInputElement).value = '';
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
    const name = (document.getElementById('profile-name') as HTMLInputElement).value.trim();
    if (!name) return;
    const role = (document.getElementById('profile-role') as HTMLInputElement).value.trim() || undefined;
    const cloneFrom = (document.getElementById('clone-from') as HTMLSelectElement).value || undefined;

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
