/**
 * GitHub Gist Sync & Backup Service
 * Allows users to backup and sync their PrivateApply configuration to a secret GitHub Gist.
 * Supports forward/backward schema compatibility, deep merging, and migration reporting.
 */

import browser from './browser-compat';
import { chromeCompat } from './browser-compat';
import type { UserProfile, ProfilesIndex } from './profile';
import { getUserProfile, saveUserProfile, getProfilesIndex } from './profile';
import {
  createDefaultLegalAndDisclosures,
  createDefaultWorkPreferences,
  type CertificationRecord,
  type EducationRecord,
} from './applicant-profile';

export const CURRENT_GIST_SCHEMA_VERSION = 2;
export const GIST_FILENAME = 'privateapply-config.json';
export const GIST_SYNC_CONFIG_KEY = 'gistSyncConfig';

export interface GistSyncConfig {
  enabled: boolean;
  patToken: string;
  gistId: string;
  gistUrl?: string;
  autoSync: boolean;
  lastSyncTime?: number;
  lastSyncStatus?: 'success' | 'error' | 'idle';
  lastSyncError?: string;
  lastSyncSummary?: string;
  lastModifiedFields?: ModifiedFieldNotice[];
}

export interface GistSyncPayload {
  schemaVersion: number;
  extensionVersion: string;
  exportedAt: string;
  activeProfile: UserProfile;
  profilesIndex?: ProfilesIndex;
  allProfiles?: Record<string, UserProfile>;
  settings?: Record<string, any>;
}

export interface ModifiedFieldNotice {
  path: string;
  label: string;
  reason: string;
}

export interface ReconciliationResult {
  reconciledProfile: UserProfile;
  addedFields: string[];
  modifiedFields: ModifiedFieldNotice[];
  hasModifications: boolean;
}

/**
 * Registry of schema evolution notes.
 * If incoming schemaVersion < modifiedInVersion, the field is treated as modified,
 * overridden with blank/default, and reported to the user to fill again.
 */
interface SchemaMigrationDef {
  path: string;
  label: string;
  modifiedInVersion: number;
  reason: string;
}

const SCHEMA_MIGRATIONS: SchemaMigrationDef[] = [
  {
    path: 'personal.phone',
    label: 'Primary Phone / Country Code',
    modifiedInVersion: 2,
    reason: 'Phone format upgraded to structured country-code model. Please verify your number.',
  },
];

/**
 * Extract Gist ID from a raw ID or full GitHub Gist URL.
 * Handles inputs like:
 * - "8f64a13d7120e29b1248"
 * - "https://gist.github.com/octocat/8f64a13d7120e29b1248"
 * - "https://gist.github.com/8f64a13d7120e29b1248"
 * - "gist.github.com/user/8f64a13d7120e29b1248/"
 */
export function extractGistId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim().replace(/\/+$/, '');
  // Match 20-32 alphanumeric hex chars at end of string or URL
  const match = trimmed.match(/([a-f0-9]{20,32})$/i);
  if (match) return match[1];

  // Also match any general alphanumeric gist slug if named
  const urlParts = trimmed.split('/');
  const lastPart = urlParts[urlParts.length - 1];
  if (lastPart && /^[a-zA-Z0-9_\-]+$/.test(lastPart) && lastPart.length >= 10) {
    return lastPart;
  }
  return null;
}

/**
 * Construct canonical blank profile template.
 */
export function createCanonicalTemplateProfile(): UserProfile {
  return {
    personal: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      location: '',
      universityEmail: '',
      workEmail: '',
      alternatePhone: '',
      permanentAddress: '',
      mailingAddress: '',
      nationality: '',
      citizenship: '',
      preferredContactMethod: 'email',
    },
    passport: {
      passportNumber: '',
      issuingCountry: '',
      expiryDate: '',
      issueDate: '',
      nationality: '',
    },
    professional: {
      linkedin: '',
      github: '',
      portfolio: '',
      website: '',
      twitter: '',
      youtube: '',
      instagram: '',
      facebook: '',
      threads: '',
      bluesky: '',
      medium: '',
      otherLinks: [],
      currentRole: '',
      currentCompany: '',
      noticePeriod: '',
    },
    work: [],
    education: [],
    skills: [],
    educationHistory: [],
    certifications: [],
    employmentHistory: [],
    familyContacts: [],
    references: [],
    compensation: {
      currency: 'USD',
      salaryPeriod: 'annual',
      isNegotiable: false,
    },
    workPreferences: createDefaultWorkPreferences(),
    legalDisclosures: createDefaultLegalAndDisclosures(),
    countryPacksData: {},
    employmentPacksData: {},
    customFields: [],
    questionBank: [],
    lastUpdated: Date.now(),
  };
}

/**
 * Reconcile an incoming profile from JSON against the canonical schema.
 * - Missing fields in incoming: populated with blank/default.
 * - Matching fields with valid types: preserved.
 * - Modified/incompatible fields: overridden with blank/default, flagged for re-filling.
 */
export function reconcileProfileSchema(
  incoming: any,
  sourceSchemaVersion: number = 1
): ReconciliationResult {
  const template = createCanonicalTemplateProfile();
  const addedFields: string[] = [];
  const modifiedFields: ModifiedFieldNotice[] = [];

  if (!incoming || typeof incoming !== 'object') {
    return {
      reconciledProfile: template,
      addedFields: ['all'],
      modifiedFields: [{ path: 'profile', label: 'Entire Profile', reason: 'Invalid or empty backup data. Reset to defaults.' }],
      hasModifications: true,
    };
  }

  const result: UserProfile = { ...template };

  // 1. Personal
  const incPersonal = incoming.personal || {};
  result.personal = { ...template.personal };

  for (const [key, defaultVal] of Object.entries(template.personal)) {
    const val = incPersonal[key];
    const path = `personal.${key}`;

    if (val === undefined || val === null) {
      addedFields.push(path);
      (result.personal as any)[key] = defaultVal;
      continue;
    }

    // Check schema migration overrides
    const migration = SCHEMA_MIGRATIONS.find(m => m.path === path && sourceSchemaVersion < m.modifiedInVersion);
    if (migration) {
      modifiedFields.push({ path, label: migration.label, reason: migration.reason });
      (result.personal as any)[key] = defaultVal;
      continue;
    }

    // Best-try data type preservation
    if (key === 'phone' || key === 'alternatePhone') {
      if (typeof val === 'string' || (typeof val === 'object' && val !== null && 'number' in val)) {
        (result.personal as any)[key] = val;
      } else {
        modifiedFields.push({ path, label: `Personal ${key}`, reason: 'Data type changed. Please re-enter contact number.' });
        (result.personal as any)[key] = defaultVal;
      }
    } else if (key === 'location' || key === 'permanentAddress' || key === 'mailingAddress') {
      if (typeof val === 'string' || (typeof val === 'object' && val !== null && 'city' in val)) {
        (result.personal as any)[key] = val;
      } else {
        modifiedFields.push({ path, label: `Personal ${key}`, reason: 'Address format was updated. Please re-enter.' });
        (result.personal as any)[key] = defaultVal;
      }
    } else if (typeof defaultVal === 'string') {
      if (typeof val === 'string') {
        (result.personal as any)[key] = val;
      } else if (typeof val === 'number') {
        (result.personal as any)[key] = String(val); // lossless coercion
      } else {
        modifiedFields.push({ path, label: `Personal ${key}`, reason: 'Expected text format. Value reset.' });
        (result.personal as any)[key] = defaultVal;
      }
    } else {
      (result.personal as any)[key] = val;
    }
  }

  // 2. Passport
  const incPassport = incoming.passport;
  if (!incPassport) {
    addedFields.push('passport');
    result.passport = { ...template.passport! };
  } else if (typeof incPassport === 'object') {
    result.passport = { ...template.passport! };
    for (const [key, defaultVal] of Object.entries(template.passport!)) {
      const val = incPassport[key];
      const path = `passport.${key}`;
      if (val === undefined || val === null) {
        addedFields.push(path);
      } else if (typeof val === 'string') {
        (result.passport as any)[key] = val;
      } else {
        modifiedFields.push({ path, label: `Passport ${key}`, reason: 'Incompatible format. Please refill.' });
      }
    }
  }

  // 3. Professional & Social Links
  const incProf = incoming.professional || {};
  result.professional = { ...template.professional };
  for (const [key, defaultVal] of Object.entries(template.professional)) {
    const val = incProf[key];
    const path = `professional.${key}`;

    if (val === undefined || val === null) {
      addedFields.push(path);
      (result.professional as any)[key] = defaultVal;
      continue;
    }

    if (Array.isArray(defaultVal)) {
      if (Array.isArray(val)) {
        (result.professional as any)[key] = val;
      } else {
        modifiedFields.push({ path, label: `Professional ${key}`, reason: 'Expected array format. Reset.' });
        (result.professional as any)[key] = defaultVal;
      }
    } else if (typeof defaultVal === 'string') {
      if (typeof val === 'string') {
        (result.professional as any)[key] = val;
      } else if (typeof val === 'number') {
        (result.professional as any)[key] = String(val);
      } else {
        modifiedFields.push({ path, label: `Professional ${key}`, reason: 'Expected URL or text. Value reset.' });
        (result.professional as any)[key] = defaultVal;
      }
    } else {
      (result.professional as any)[key] = val;
    }
  }

  // 4. Arrays (work, education, skills)
  result.skills = Array.isArray(incoming.skills) ? incoming.skills.map(String) : [];
  result.work = Array.isArray(incoming.work) ? incoming.work : [];
  result.education = Array.isArray(incoming.education) ? incoming.education : [];

  // 5. Extended Catalogue (educationHistory, certifications, employmentHistory, familyContacts, references)
  if (Array.isArray(incoming.educationHistory)) {
    result.educationHistory = incoming.educationHistory.map((item: any): EducationRecord => {
      const institution = String(item.schoolOrInstitution || item.institution || '');
      const qualification = String(item.qualificationTitle || item.degree || '');
      return {
        id: item.id || `edu_${Date.now()}_${Math.random()}`,
        schoolOrInstitution: institution,
        qualificationTitle: qualification,
        level: item.level || 'undergraduate',
        streamOrMajor: item.streamOrMajor ? String(item.streamOrMajor) : (item.fieldOfStudy ? String(item.fieldOfStudy) : undefined),
        startYear: item.startYear !== undefined ? String(item.startYear) : String(new Date().getFullYear() - 4),
        endYear: item.endYear !== undefined ? String(item.endYear) : undefined,
        scoreValue: item.scoreValue !== undefined ? item.scoreValue : (item.scoreOrGpa !== undefined ? item.scoreOrGpa : undefined),
        scaleMax: item.scaleMax !== undefined ? Number(item.scaleMax) : (item.scoreScale !== undefined ? Number(item.scoreScale) : undefined),
      };
    });
  } else {
    addedFields.push('educationHistory');
    result.educationHistory = [];
  }

  if (Array.isArray(incoming.certifications)) {
    result.certifications = incoming.certifications.map((item: any): CertificationRecord => ({
      id: item.id || `cert_${Date.now()}_${Math.random()}`,
      name: String(item.name || ''),
      issuer: String(item.issuer || ''),
      issuerAliases: Array.isArray(item.issuerAliases) ? item.issuerAliases.map(String) : [],
      examCode: item.examCode ? String(item.examCode) : undefined,
      credentialId: item.credentialId ? String(item.credentialId) : undefined,
      verificationUrl: item.verificationUrl ? String(item.verificationUrl) : undefined,
      issueDate: String(item.issueDate || ''),
      expiryDate: item.expiryDate ? String(item.expiryDate) : undefined,
      doesNotExpire: Boolean(item.doesNotExpire),
      scoreOrGrade: item.scoreOrGrade ? String(item.scoreOrGrade) : undefined,
      skillsCovered: Array.isArray(item.skillsCovered) ? item.skillsCovered.map(String) : undefined,
      description: item.description ? String(item.description) : undefined,
    }));
  } else {
    addedFields.push('certifications');
    result.certifications = [];
  }

  result.employmentHistory = Array.isArray(incoming.employmentHistory) ? incoming.employmentHistory : [];
  result.familyContacts = Array.isArray(incoming.familyContacts) ? incoming.familyContacts : [];
  result.references = Array.isArray(incoming.references) ? incoming.references : [];
  result.customFields = Array.isArray(incoming.customFields) ? incoming.customFields : [];
  result.questionBank = Array.isArray(incoming.questionBank) ? incoming.questionBank : [];
  result.compensation = incoming.compensation && typeof incoming.compensation === 'object' ? incoming.compensation : template.compensation;

  // 6. Work Preferences
  const defaultWP = createDefaultWorkPreferences();
  const incWP = incoming.workPreferences || {};
  result.workPreferences = { ...defaultWP };
  for (const [k, defVal] of Object.entries(defaultWP)) {
    const val = incWP[k];
    if (val === undefined || val === null) {
      addedFields.push(`workPreferences.${k}`);
    } else if (typeof val === typeof defVal || (Array.isArray(defVal) && Array.isArray(val))) {
      (result.workPreferences as any)[k] = val;
    } else {
      modifiedFields.push({ path: `workPreferences.${k}`, label: `Work Preference ${k}`, reason: 'Type changed. Reset to default.' });
    }
  }

  // 7. Legal Disclosures & Consents
  const defaultLD = createDefaultLegalAndDisclosures();
  const incLD = incoming.legalDisclosures || {};
  result.legalDisclosures = { ...defaultLD };
  for (const [k, defVal] of Object.entries(defaultLD)) {
    const val = incLD[k];
    const path = `legalDisclosures.${k}`;
    if (val === undefined || val === null) {
      addedFields.push(path);
      (result.legalDisclosures as any)[k] = defVal;
    } else if (typeof val === typeof defVal) {
      (result.legalDisclosures as any)[k] = val;
    } else if (typeof defVal === 'boolean' && (val === 'true' || val === 'false')) {
      (result.legalDisclosures as any)[k] = val === 'true'; // safe boolean coercion
    } else {
      modifiedFields.push({ path, label: `Screening Disclosure ${k}`, reason: 'Type mismatch. Reset to default.' });
      (result.legalDisclosures as any)[k] = defVal;
    }
  }

  // 8. Packs data
  result.countryPacksData = incoming.countryPacksData && typeof incoming.countryPacksData === 'object' ? incoming.countryPacksData : {};
  result.employmentPacksData = incoming.employmentPacksData && typeof incoming.employmentPacksData === 'object' ? incoming.employmentPacksData : {};

  result.lastUpdated = Date.now();

  return {
    reconciledProfile: result,
    addedFields,
    modifiedFields,
    hasModifications: modifiedFields.length > 0,
  };
}

/**
 * Retrieve saved Gist sync configuration.
 */
export async function getGistSyncConfig(): Promise<GistSyncConfig> {
  try {
    const result = await chromeCompat.storage.local.get(GIST_SYNC_CONFIG_KEY);
    return (
      result[GIST_SYNC_CONFIG_KEY] || {
        enabled: false,
        patToken: '',
        gistId: '',
        autoSync: false,
        lastSyncStatus: 'idle',
      }
    );
  } catch (err) {
    console.error('[GistSync] Failed to get sync config:', err);
    return {
      enabled: false,
      patToken: '',
      gistId: '',
      autoSync: false,
      lastSyncStatus: 'idle',
    };
  }
}

/**
 * Save Gist sync configuration.
 */
export async function saveGistSyncConfig(config: Partial<GistSyncConfig>): Promise<void> {
  const current = await getGistSyncConfig();
  const merged: GistSyncConfig = { ...current, ...config };
  await chromeCompat.storage.local.set({ [GIST_SYNC_CONFIG_KEY]: merged });
}

/**
 * Test Personal Access Token by querying GitHub user endpoint.
 */
export async function testGistConnection(patToken: string): Promise<{ success: boolean; username?: string; error?: string }> {
  const token = (patToken || '').trim();
  if (!token) {
    return { success: false, error: 'Personal Access Token is required.' };
  }

  try {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (res.status === 401) {
      return { success: false, error: 'Invalid token or token has expired (HTTP 401).' };
    }
    if (!res.ok) {
      return { success: false, error: `GitHub API error: ${res.status} ${res.statusText}` };
    }

    const data = await res.json();
    return { success: true, username: data.login };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network request failed' };
  }
}

/**
 * Automatically create a new Secret Gist on user's GitHub account.
 */
export async function createSecretGist(
  patToken: string,
  payload?: GistSyncPayload
): Promise<{ success: boolean; gistId?: string; gistUrl?: string; error?: string }> {
  const token = (patToken || '').trim();
  if (!token) {
    return { success: false, error: 'Personal Access Token is required to create a Gist.' };
  }

  let finalPayload: GistSyncPayload;
  if (payload) {
    finalPayload = payload;
  } else {
    const activeProfile = (await getUserProfile()) || createCanonicalTemplateProfile();
    const profilesIndex = await getProfilesIndex();
    finalPayload = {
      schemaVersion: CURRENT_GIST_SCHEMA_VERSION,
      extensionVersion: '0.9.0',
      exportedAt: new Date().toISOString(),
      activeProfile,
      profilesIndex: profilesIndex || undefined,
    };
  }

  try {
    const body = {
      description: 'PrivateApply Candidate Profile & Extension Configuration (Secret Backup)',
      public: false,
      files: {
        [GIST_FILENAME]: {
          content: JSON.stringify(finalPayload, null, 2),
        },
      },
    };

    const res = await fetch('https://api.github.com/gists', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return {
        success: false,
        error: errBody.message || `Failed to create secret Gist (${res.status} ${res.statusText})`,
      };
    }

    const data = await res.json();
    const gistId = data.id;
    const gistUrl = data.html_url;

    await saveGistSyncConfig({
      gistId,
      gistUrl,
      lastSyncTime: Date.now(),
      lastSyncStatus: 'success',
      lastSyncError: undefined,
      lastSyncSummary: 'Secret Gist created successfully.',
    });

    return { success: true, gistId, gistUrl };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to create secret Gist.' };
  }
}

/**
 * Push current profile configuration to the configured Secret Gist.
 */
export async function pushToGist(
  configOverride?: Partial<GistSyncConfig>
): Promise<{ success: boolean; gistUrl?: string; error?: string }> {
  const config = { ...(await getGistSyncConfig()), ...(configOverride || {}) };
  const token = (config.patToken || '').trim();
  const gistId = extractGistId(config.gistId || '');

  if (!token) return { success: false, error: 'Personal Access Token is missing.' };
  if (!gistId) return { success: false, error: 'Valid Gist ID or URL is required.' };

  try {
    const activeProfile = (await getUserProfile()) || createCanonicalTemplateProfile();
    const profilesIndex = await getProfilesIndex();

    const payload: GistSyncPayload = {
      schemaVersion: CURRENT_GIST_SCHEMA_VERSION,
      extensionVersion: '0.9.0',
      exportedAt: new Date().toISOString(),
      activeProfile,
      profilesIndex: profilesIndex || undefined,
    };

    const body = {
      description: 'PrivateApply Candidate Profile & Extension Configuration (Secret Backup)',
      files: {
        [GIST_FILENAME]: {
          content: JSON.stringify(payload, null, 2),
        },
      },
    };

    const res = await fetch(`https://api.github.com/gists/${gistId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const errorMsg = errBody.message || `Failed to update Gist (${res.status} ${res.statusText})`;
      await saveGistSyncConfig({
        lastSyncStatus: 'error',
        lastSyncError: errorMsg,
      });
      return { success: false, error: errorMsg };
    }

    const data = await res.json();
    const gistUrl = data.html_url;

    await saveGistSyncConfig({
      gistUrl,
      lastSyncTime: Date.now(),
      lastSyncStatus: 'success',
      lastSyncError: undefined,
      lastSyncSummary: `Successfully backed up at ${new Date().toLocaleTimeString()}`,
    });

    return { success: true, gistUrl };
  } catch (err: any) {
    const errorMsg = err.message || 'Push to Gist failed';
    await saveGistSyncConfig({
      lastSyncStatus: 'error',
      lastSyncError: errorMsg,
    });
    return { success: false, error: errorMsg };
  }
}

/**
 * Pull and sync configuration from the Secret Gist.
 * Runs schema reconciliation, fills blanks for new fields, overrides modified fields,
 * and updates local profile storage.
 */
export async function pullFromGist(
  configOverride?: Partial<GistSyncConfig>
): Promise<{ success: boolean; reconciliation?: ReconciliationResult; gistUrl?: string; error?: string }> {
  const config = { ...(await getGistSyncConfig()), ...(configOverride || {}) };
  const token = (config.patToken || '').trim();
  const gistId = extractGistId(config.gistId || '');

  if (!token) return { success: false, error: 'Personal Access Token is missing.' };
  if (!gistId) return { success: false, error: 'Valid Gist ID or URL is required.' };

  try {
    const res = await fetch(`https://api.github.com/gists/${gistId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const errorMsg = errBody.message || `Failed to retrieve Gist (${res.status} ${res.statusText})`;
      await saveGistSyncConfig({
        lastSyncStatus: 'error',
        lastSyncError: errorMsg,
      });
      return { success: false, error: errorMsg };
    }

    const data = await res.json();
    const file = data.files?.[GIST_FILENAME];
    if (!file || !file.content) {
      return {
        success: false,
        error: `File "${GIST_FILENAME}" not found in Gist. Please push a backup first or check the Gist ID.`,
      };
    }

    let parsedPayload: GistSyncPayload;
    try {
      parsedPayload = JSON.parse(file.content);
    } catch {
      return { success: false, error: 'Gist content is not valid JSON.' };
    }

    const sourceVersion = parsedPayload.schemaVersion || 1;
    const incomingProfile = parsedPayload.activeProfile || (parsedPayload as any);

    // Reconcile schema: forward/backward compatibility
    const reconciliation = reconcileProfileSchema(incomingProfile, sourceVersion);

    // Persist reconciled profile into active storage
    await saveUserProfile(reconciliation.reconciledProfile);

    const gistUrl = data.html_url;
    const summary = reconciliation.hasModifications
      ? `Synced with ${reconciliation.modifiedFields.length} modified field(s) needing refill.`
      : `Synced cleanly with ${reconciliation.addedFields.length} new default fields.`;

    await saveGistSyncConfig({
      gistUrl,
      lastSyncTime: Date.now(),
      lastSyncStatus: 'success',
      lastSyncError: undefined,
      lastSyncSummary: summary,
      lastModifiedFields: reconciliation.modifiedFields,
    });

    return { success: true, reconciliation, gistUrl };
  } catch (err: any) {
    const errorMsg = err.message || 'Pull from Gist failed';
    await saveGistSyncConfig({
      lastSyncStatus: 'error',
      lastSyncError: errorMsg,
    });
    return { success: false, error: errorMsg };
  }
}

/**
 * Auto-sync trigger: if enabled, pushes to Gist in the background without blocking UI.
 */
export async function triggerAutoGistSyncIfEnabled(): Promise<void> {
  try {
    const config = await getGistSyncConfig();
    if (config.enabled && config.autoSync && config.patToken && config.gistId) {
      pushToGist().catch(err => console.warn('[GistSync] Auto-sync failed:', err));
    }
  } catch (err) {
    console.warn('[GistSync] Failed checking auto-sync condition:', err);
  }
}
