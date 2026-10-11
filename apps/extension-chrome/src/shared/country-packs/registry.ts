/**
 * Country-Pack Registry & Manager
 * Provides catalog access, custom JSON pack import/export, validation, and profile binding.
 */

import browser from '../browser-compat';
import type { CountryPack, CountryPackField } from './types';
import { IN_PACK } from './packs/in-pack';
import { US_PACK } from './packs/us-pack';
import { DE_PACK } from './packs/de-pack';
import { GB_PACK } from './packs/gb-pack';

export const BUILTIN_COUNTRY_PACKS: CountryPack[] = [
  IN_PACK,
  US_PACK,
  DE_PACK,
  GB_PACK,
];

const STORAGE_ACTIVE_PACKS_KEY = 'activeCountryPackIds';
const STORAGE_CUSTOM_PACKS_KEY = 'customCountryPacks';

/**
 * Returns all built-in country packs shipped with the extension.
 */
export function getBuiltinPacks(): CountryPack[] {
  return BUILTIN_COUNTRY_PACKS;
}

/**
 * Returns custom country packs imported by the user.
 */
export async function getCustomPacks(): Promise<CountryPack[]> {
  try {
    const res = await browser.storage.local.get(STORAGE_CUSTOM_PACKS_KEY);
    return Array.isArray(res[STORAGE_CUSTOM_PACKS_KEY]) ? res[STORAGE_CUSTOM_PACKS_KEY] : [];
  } catch (err) {
    console.warn('[CountryPacks] Failed to load custom packs:', err);
    return [];
  }
}

/**
 * Returns all available country packs (built-in + custom).
 */
export async function getAllPacks(): Promise<CountryPack[]> {
  const custom = await getCustomPacks();
  // Filter out any custom pack whose ID conflicts with a built-in pack
  const filteredCustom = custom.filter(c => !BUILTIN_COUNTRY_PACKS.some(b => b.id === c.id));
  return [...BUILTIN_COUNTRY_PACKS, ...filteredCustom];
}

/**
 * Returns list of active (enabled) country pack IDs.
 * Default: ['IN-pack']
 */
export async function getActivePackIds(): Promise<string[]> {
  try {
    const res = await browser.storage.local.get(STORAGE_ACTIVE_PACKS_KEY);
    const stored = res[STORAGE_ACTIVE_PACKS_KEY];
    if (Array.isArray(stored) && stored.length > 0) {
      return stored;
    }
  } catch (err) {
    console.warn('[CountryPacks] Failed to load active pack IDs:', err);
  }
  return ['IN-pack'];
}

/**
 * Sets the list of active (enabled) country pack IDs.
 */
export async function setActivePackIds(ids: string[]): Promise<void> {
  const unique = Array.from(new Set(ids));
  await browser.storage.local.set({ [STORAGE_ACTIVE_PACKS_KEY]: unique });
}

/**
 * Returns only the active CountryPack objects.
 */
export async function getActivePacks(): Promise<CountryPack[]> {
  const all = await getAllPacks();
  const activeIds = await getActivePackIds();
  return all.filter(p => activeIds.includes(p.id));
}

/**
 * Toggles an individual country pack on or off.
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
 * Saves or updates a user-imported custom country pack.
 */
export async function saveCustomPack(pack: CountryPack): Promise<void> {
  pack.isCustom = true;
  const custom = await getCustomPacks();
  const existingIdx = custom.findIndex(p => p.id === pack.id);
  if (existingIdx >= 0) {
    custom[existingIdx] = pack;
  } else {
    custom.push(pack);
  }
  await browser.storage.local.set({ [STORAGE_CUSTOM_PACKS_KEY]: custom });
  // Automatically enable newly imported pack
  await togglePackActive(pack.id, true);
}

/**
 * Deletes a user-imported custom country pack.
 */
export async function deleteCustomPack(packId: string): Promise<void> {
  const custom = await getCustomPacks();
  const filtered = custom.filter(p => p.id !== packId);
  await browser.storage.local.set({ [STORAGE_CUSTOM_PACKS_KEY]: filtered });
  await togglePackActive(packId, false);
}

/**
 * Validates a country-pack JSON file or string.
 */
export function validatePackJson(jsonStr: string): { valid: boolean; pack?: CountryPack; error?: string } {
  try {
    const parsed = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
    if (!parsed || typeof parsed !== 'object') {
      return { valid: false, error: 'Pack must be a valid JSON object.' };
    }

    if (!parsed.id || typeof parsed.id !== 'string') {
      return { valid: false, error: 'Pack is missing a valid string "id" (e.g. "FR-pack").' };
    }

    if (!/^[A-Z]{2,3}-pack$/i.test(parsed.id)) {
      return { valid: false, error: 'Pack "id" must follow the pattern [COUNTRY_CODE]-pack (e.g. "FR-pack", "CA-pack").' };
    }

    if (!parsed.countryCode || typeof parsed.countryCode !== 'string' || parsed.countryCode.length < 2) {
      return { valid: false, error: 'Pack is missing a 2-letter ISO "countryCode" (e.g. "FR").' };
    }

    if (!parsed.countryName || typeof parsed.countryName !== 'string') {
      return { valid: false, error: 'Pack is missing a string "countryName" (e.g. "France").' };
    }

    if (!Array.isArray(parsed.fields) || parsed.fields.length === 0) {
      return { valid: false, error: 'Pack must contain a non-empty "fields" array.' };
    }

    for (let i = 0; i < parsed.fields.length; i++) {
      const f = parsed.fields[i];
      if (!f.key || typeof f.key !== 'string') {
        return { valid: false, error: `Field at index ${i} is missing a string "key".` };
      }
      if (!f.label || typeof f.label !== 'string') {
        return { valid: false, error: `Field "${f.key}" is missing a string "label".` };
      }
      if (!['text', 'number', 'date', 'boolean', 'choice', 'masked_identifier'].includes(f.dataType)) {
        return { valid: false, error: `Field "${f.key}" has invalid dataType "${f.dataType}".` };
      }
      if (!Array.isArray(f.aliases)) {
        return { valid: false, error: `Field "${f.key}" must define an array of string "aliases".` };
      }
      if (!['ordinary', 'sensitive_personal', 'restricted_identifier'].includes(f.sensitivity)) {
        f.sensitivity = 'ordinary';
      }
    }

    const pack: CountryPack = {
      id: parsed.id,
      countryCode: parsed.countryCode.toUpperCase(),
      countryName: parsed.countryName,
      icon: parsed.icon || '🌐',
      version: parsed.version || '1.0.0',
      description: parsed.description || `Country-pack for ${parsed.countryName}`,
      maintainer: parsed.maintainer || 'Community Contributor',
      isCustom: true,
      fields: parsed.fields.map((f: any) => ({
        id: f.id || `${parsed.id.toLowerCase()}_${f.key}`,
        key: f.key,
        label: f.label,
        dataType: f.dataType,
        aliases: f.aliases.map((a: any) => String(a).toLowerCase().trim()).filter(Boolean),
        placeholder: f.placeholder,
        validationRegex: f.validationRegex,
        options: Array.isArray(f.options) ? f.options : undefined,
        defaultValue: f.defaultValue,
        helpText: f.helpText,
        sensitivity: f.sensitivity || 'ordinary',
      })),
    };

    return { valid: true, pack };
  } catch (err: any) {
    return { valid: false, error: `JSON Parse error: ${err.message}` };
  }
}

/**
 * Returns a documented starter template JSON string for authors to create custom packs
 * or submit as a pull request to the PrivateApply repository.
 */
export function getCountryPackTemplateJson(): string {
  const template = {
    $schema: "https://raw.githubusercontent.com/joelnishanth/private-apply/main/schemas/country-pack.schema.json",
    _comment: "Private Apply Country-Pack Template. You can import this directly in Settings or submit it as a PR to add your country to the official extension!",
    id: "XX-pack",
    countryCode: "XX",
    countryName: "Country Name",
    icon: "🌐",
    version: "1.0.0",
    description: "Jurisdiction-specific identifiers, compliance questions, and recruitment requirements for Country Name.",
    maintainer: "@your-github-username",
    fields: [
      {
        id: "xx_national_tax_id",
        key: "national_tax_id",
        label: "National Tax / Revenue Number",
        dataType: "masked_identifier",
        placeholder: "123456789",
        validationRegex: "^[0-9]{9}$",
        aliases: [
          "tax id",
          "national tax number",
          "revenue id",
          "fiscal code"
        ],
        helpText: "Primary tax identification number used on employment tax documentation.",
        sensitivity: "restricted_identifier"
      },
      {
        id: "xx_work_permit_status",
        key: "work_permit_status",
        label: "National Work Authorization / Permit Status",
        dataType: "choice",
        options: [
          "citizen",
          "permanent_resident",
          "work_visa",
          "student_visa_with_work_rights",
          "requires_sponsorship"
        ],
        defaultValue: "citizen",
        aliases: [
          "work permit status",
          "residence permit",
          "legal entitlement to work",
          "visa category"
        ],
        helpText: "Select your legal residency or employment entitlement category.",
        sensitivity: "sensitive_personal"
      },
      {
        id: "xx_student_id",
        key: "student_id",
        label: "Student Roll / Matriculation Number",
        dataType: "text",
        placeholder: "e.g. STU-2024-99",
        aliases: [
          "student id",
          "matriculation number",
          "roll number",
          "student registration"
        ],
        helpText: "Required for university campus recruitment drives.",
        sensitivity: "ordinary"
      }
    ]
  };

  return JSON.stringify(template, null, 2);
}

/**
 * Helper to trigger browser download of the Country-Pack template file.
 */
export function downloadCountryPackTemplate(): void {
  const content = getCountryPackTemplateJson();
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'country-pack-template.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
