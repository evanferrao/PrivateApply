/**
 * Employment-Pack Registry & Manager
 * Provides catalog access, custom JSON pack import/export, validation, and profile binding.
 */

import browser from '../browser-compat';
import type { EmploymentPack, EmploymentPackField } from './types';
import { CS_PACK } from './packs/cs-pack';
import { DESIGN_PACK } from './packs/design-pack';
import { DATA_SCIENCE_PACK } from './packs/data-science-pack';

export const BUILTIN_EMPLOYMENT_PACKS: EmploymentPack[] = [
  CS_PACK,
  DESIGN_PACK,
  DATA_SCIENCE_PACK,
];

const STORAGE_ACTIVE_PACKS_KEY = 'activeEmploymentPackIds';
const STORAGE_CUSTOM_PACKS_KEY = 'customEmploymentPacks';

/**
 * Returns all built-in employment packs shipped with the extension.
 */
export function getBuiltinPacks(): EmploymentPack[] {
  return BUILTIN_EMPLOYMENT_PACKS;
}

/**
 * Returns custom employment packs imported by the user.
 */
export async function getCustomPacks(): Promise<EmploymentPack[]> {
  try {
    const res = await browser.storage.local.get(STORAGE_CUSTOM_PACKS_KEY);
    return Array.isArray(res[STORAGE_CUSTOM_PACKS_KEY]) ? res[STORAGE_CUSTOM_PACKS_KEY] : [];
  } catch (err) {
    console.warn('[EmploymentPacks] Failed to load custom packs:', err);
    return [];
  }
}

/**
 * Returns all available employment packs (built-in + custom).
 */
export async function getAllPacks(): Promise<EmploymentPack[]> {
  const custom = await getCustomPacks();
  // Filter out custom packs conflicting with built-in IDs
  const filteredCustom = custom.filter(c => !BUILTIN_EMPLOYMENT_PACKS.some(b => b.id === c.id));
  return [...BUILTIN_EMPLOYMENT_PACKS, ...filteredCustom];
}

/**
 * Returns list of active (enabled) employment pack IDs.
 * Default: ['cs-pack']
 */
export async function getActivePackIds(): Promise<string[]> {
  try {
    const res = await browser.storage.local.get(STORAGE_ACTIVE_PACKS_KEY);
    const stored = res[STORAGE_ACTIVE_PACKS_KEY];
    if (Array.isArray(stored) && stored.length > 0) {
      return stored;
    }
  } catch (err) {
    console.warn('[EmploymentPacks] Failed to load active pack IDs:', err);
  }
  return ['cs-pack'];
}

/**
 * Sets list of active employment pack IDs.
 */
export async function setActivePackIds(ids: string[]): Promise<void> {
  const unique = Array.from(new Set(ids));
  await browser.storage.local.set({ [STORAGE_ACTIVE_PACKS_KEY]: unique });
}

/**
 * Returns only the active EmploymentPack objects.
 */
export async function getActivePacks(): Promise<EmploymentPack[]> {
  const all = await getAllPacks();
  const activeIds = await getActivePackIds();
  return all.filter(p => activeIds.includes(p.id));
}

/**
 * Toggles an individual employment pack on or off.
 */
export async function togglePackActive(packId: string, enabled: boolean): Promise<void> {
  const current = await getActivePackIds();
  let updated: string[];
  if (enabled) {
    updated = Array.from(new Set([...current, packId]));
  } else {
    updated = current.filter(id => id !== packId);
  }
  await setActivePackIds(updated);
}

/**
 * Persists a validated custom employment pack into storage and activates it.
 */
export async function saveCustomPack(pack: EmploymentPack): Promise<void> {
  const custom = await getCustomPacks();
  const existsIdx = custom.findIndex(p => p.id === pack.id);
  const updatedPack: EmploymentPack = { ...pack, isCustom: true };

  if (existsIdx >= 0) {
    custom[existsIdx] = updatedPack;
  } else {
    custom.push(updatedPack);
  }

  await browser.storage.local.set({ [STORAGE_CUSTOM_PACKS_KEY]: custom });
  await togglePackActive(pack.id, true);
}

/**
 * Deletes a custom employment pack by ID.
 */
export async function deleteCustomPack(packId: string): Promise<void> {
  const custom = await getCustomPacks();
  const filtered = custom.filter(p => p.id !== packId);
  await browser.storage.local.set({ [STORAGE_CUSTOM_PACKS_KEY]: filtered });
  await togglePackActive(packId, false);
}

/**
 * Validates raw JSON string or object against EmploymentPack schema.
 */
export function validateEmploymentPackJson(raw: string | object): {
  valid: boolean;
  pack?: EmploymentPack;
  error?: string;
} {
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;

    if (!data || typeof data !== 'object') {
      return { valid: false, error: 'Pack must be a valid JSON object' };
    }

    if (!data.id || typeof data.id !== 'string' || !/^[a-z0-9_-]+$/i.test(data.id)) {
      return { valid: false, error: 'Invalid or missing "id". Must be alphanumeric with hyphens (e.g. "finance-pack")' };
    }

    if (!data.name || typeof data.name !== 'string') {
      return { valid: false, error: 'Missing or invalid "name" string' };
    }

    if (!Array.isArray(data.fields) || data.fields.length === 0) {
      return { valid: false, error: '"fields" must be a non-empty array of field definitions' };
    }

    const validDataTypes = ['url', 'text', 'number', 'choice', 'multi_choice', 'textarea'];

    for (let i = 0; i < data.fields.length; i++) {
      const f = data.fields[i];
      if (!f.key || typeof f.key !== 'string') {
        return { valid: false, error: `Field at index ${i} missing valid "key"` };
      }
      if (!f.label || typeof f.label !== 'string') {
        return { valid: false, error: `Field "${f.key}" missing valid "label"` };
      }
      if (!validDataTypes.includes(f.dataType)) {
        return { valid: false, error: `Field "${f.key}" invalid dataType: ${f.dataType}. Allowed: ${validDataTypes.join(', ')}` };
      }
    }

    const pack: EmploymentPack = {
      id: String(data.id).trim(),
      name: String(data.name).trim(),
      discipline: String(data.discipline || 'General').trim(),
      icon: String(data.icon || '💼').trim(),
      version: String(data.version || '1.0.0').trim(),
      description: String(data.description || '').trim(),
      maintainer: data.maintainer ? String(data.maintainer).trim() : undefined,
      isCustom: true,
      fields: data.fields.map((f: any, idx: number) => ({
        id: f.id || `${data.id}_${f.key || idx}`,
        key: String(f.key).trim(),
        label: String(f.label).trim(),
        category: f.category ? String(f.category).trim() : undefined,
        dataType: f.dataType,
        aliases: Array.isArray(f.aliases) ? f.aliases.map((a: any) => String(a).toLowerCase().trim()) : [],
        placeholder: f.placeholder ? String(f.placeholder) : undefined,
        validationRegex: f.validationRegex ? String(f.validationRegex) : undefined,
        options: Array.isArray(f.options) ? f.options.map((o: any) => String(o)) : undefined,
        defaultValue: f.defaultValue,
        helpText: f.helpText ? String(f.helpText) : undefined,
        sensitivity: f.sensitivity || 'ordinary',
      })),
    };

    return { valid: true, pack };
  } catch (err: any) {
    return { valid: false, error: err.message || 'JSON parsing failed' };
  }
}

/**
 * Generates an annotated EmploymentPack template for community authors.
 */
export function generateEmploymentPackTemplate(): EmploymentPack {
  return {
    id: 'example-role-pack',
    name: 'Example Discipline Pack',
    discipline: 'Engineering',
    icon: '🚀',
    version: '1.0.0',
    description: 'Specialized profile URLs, portfolios, and certification links for this role.',
    maintainer: 'Your GitHub Username or Name',
    fields: [
      {
        id: 'example_primary_profile',
        key: 'primary_profile_url',
        label: 'Primary Industry Profile',
        category: 'Profiles & Portfolios',
        dataType: 'url',
        aliases: [
          'primary profile',
          'industry profile link',
          'profile url',
        ],
        placeholder: 'https://platform.example.com/username',
        validationRegex: '^https?:\\/\\/.+$',
        helpText: 'Your public profile URL on your primary professional evaluation platform.',
        sensitivity: 'ordinary',
      },
      {
        id: 'example_certifications',
        key: 'certifications_summary',
        label: 'Discipline Certifications',
        category: 'Credentials',
        dataType: 'text',
        aliases: [
          'certifications',
          'licenses and certifications',
          'professional credentials',
        ],
        placeholder: 'AWS Solutions Architect, PMP, CKAD',
        helpText: 'Key professional certifications and license IDs.',
        sensitivity: 'ordinary',
      },
    ],
  };
}

/**
 * Triggers a browser download of the employment pack starter JSON template.
 */
export function downloadEmploymentPackTemplate(): void {
  const template = generateEmploymentPackTemplate();
  const jsonStr = JSON.stringify(template, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'employment-pack-template.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
