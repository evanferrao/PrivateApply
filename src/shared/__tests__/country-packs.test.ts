import { describe, it, expect, beforeEach } from 'vitest';
import {
  getBuiltinPacks,
  getActivePackIds,
  setActivePackIds,
  togglePackActive,
  saveCustomPack,
  getCustomPacks,
  deleteCustomPack,
  validatePackJson,
  getCountryPackTemplateJson,
  type CountryPack,
} from '../country-packs';
import { semanticProfileMatcher } from '../semantic-profile-matcher';
import type { UserProfile } from '../profile';
import type { FieldSchema } from '../types';

function createMockField(label: string, name = '', id = '', type = 'text'): FieldSchema {
  return {
    tagName: 'input',
    type,
    name,
    id,
    label,
    autocomplete: null,
    required: false,
    disabled: false,
    multiple: false,
    selector: `input[name="${name || label}"]`,
    valuePreview: null,
  };
}

describe('Country-Packs System', () => {
  beforeEach(async () => {
    // Reset active and custom packs
    await setActivePackIds(['IN-pack']);
  });

  describe('Registry & Built-in Packs', () => {
    it('provides all 4 core built-in country packs', () => {
      const builtin = getBuiltinPacks();
      const ids = builtin.map(p => p.id);
      expect(ids).toContain('IN-pack');
      expect(ids).toContain('US-pack');
      expect(ids).toContain('DE-pack');
      expect(ids).toContain('GB-pack');
      expect(builtin.length).toBe(4);
    });

    it('defaults active packs to IN-pack and allows toggling', async () => {
      const initial = await getActivePackIds();
      expect(initial).toEqual(['IN-pack']);

      await togglePackActive('US-pack', true);
      const afterAdd = await getActivePackIds();
      expect(afterAdd).toContain('IN-pack');
      expect(afterAdd).toContain('US-pack');

      await togglePackActive('IN-pack', false);
      const afterRemove = await getActivePackIds();
      expect(afterRemove).not.toContain('IN-pack');
      expect(afterRemove).toContain('US-pack');
    });
  });

  describe('Validation & Template Generator', () => {
    it('validates a correct country-pack JSON', () => {
      const validJson = JSON.stringify({
        id: 'CA-pack',
        countryCode: 'CA',
        countryName: 'Canada',
        icon: '🇨🇦',
        version: '1.0.0',
        description: 'Canada Recruitment Pack',
        fields: [
          {
            key: 'sin_number',
            label: 'Social Insurance Number (SIN)',
            dataType: 'masked_identifier',
            aliases: ['sin', 'social insurance number'],
            sensitivity: 'restricted_identifier',
          },
        ],
      });

      const res = validatePackJson(validJson);
      expect(res.valid).toBe(true);
      expect(res.pack?.id).toBe('CA-pack');
      expect(res.pack?.countryCode).toBe('CA');
      expect(res.pack?.fields[0].key).toBe('sin_number');
    });

    it('rejects invalid pack IDs or missing properties', () => {
      expect(validatePackJson('not-json').valid).toBe(false);

      const invalidId = JSON.stringify({
        id: 'CanadaPack', // must match [XX]-pack
        countryCode: 'CA',
        countryName: 'Canada',
        fields: [{ key: 'test', label: 'Test', dataType: 'text', aliases: ['test'] }],
      });
      expect(validatePackJson(invalidId).valid).toBe(false);

      const missingFields = JSON.stringify({
        id: 'FR-pack',
        countryCode: 'FR',
        countryName: 'France',
        fields: [],
      });
      expect(validatePackJson(missingFields).valid).toBe(false);
    });

    it('generates a starter PR template that passes self-validation', () => {
      const templateJson = getCountryPackTemplateJson();
      const res = validatePackJson(templateJson);
      expect(res.valid).toBe(true);
      expect(res.pack?.id).toBe('XX-pack');
      expect(res.pack?.fields.length).toBeGreaterThan(0);
    });
  });

  describe('Custom Pack Persistence', () => {
    it('saves, retrieves, and deletes custom user packs', async () => {
      const customPack: CountryPack = {
        id: 'AU-pack',
        countryCode: 'AU',
        countryName: 'Australia',
        icon: '🇦🇺',
        version: '1.0.0',
        description: 'Australia Recruitment Pack',
        isCustom: true,
        fields: [
          {
            id: 'au_tfn',
            key: 'tax_file_number',
            label: 'Tax File Number (TFN)',
            dataType: 'masked_identifier',
            aliases: ['tfn', 'tax file number'],
            sensitivity: 'restricted_identifier',
          },
        ],
      };

      await saveCustomPack(customPack);
      const customPacks = await getCustomPacks();
      expect(customPacks.some(p => p.id === 'AU-pack')).toBe(true);

      const activeIds = await getActivePackIds();
      expect(activeIds).toContain('AU-pack'); // Auto-enabled on import

      await deleteCustomPack('AU-pack');
      const afterDelete = await getCustomPacks();
      expect(afterDelete.some(p => p.id === 'AU-pack')).toBe(false);
    });
  });

  describe('Semantic Profile Matcher Integration', () => {
    const mockProfile: UserProfile = {
      personal: {
        firstName: 'Elena',
        lastName: 'Weber',
        email: 'elena.weber@example.de',
        phone: '+49 151 12345678',
        location: 'Berlin, Germany',
      },
      professional: { currentRole: '', currentCompany: '', noticePeriod: '' },
      work: [],
      education: [],
      skills: [],
      countryPacksData: {
        'DE-pack': {
          de_steuer_id: '12 345 678 901',
          de_sozialversicherung_nr: '12 120590 A 012',
          de_aufenthaltstitel: 'unbefristet',
        },
        'US-pack': {
          ssn_last_4: '6789',
          us_veteran_status: 'not_a_veteran',
          us_driver_license_state: 'CA',
        },
        'GB-pack': {
          gb_ni_number: 'QQ 12 34 56 A',
          gb_share_code: 'W12345678',
        },
      },
      lastUpdated: Date.now(),
    };

    it('matches German Steuer-ID (tax id) with restricted confirmation', () => {
      const match = semanticProfileMatcher.match(
        createMockField('Steueridentifikationsnummer (Tax ID)', 'tax_id'),
        mockProfile
      );
      expect(match).not.toBeNull();
      expect(match?.source).toBe('country_pack');
      expect(match?.fieldKey).toBe('DE-pack_de_steuer_id');
      expect(match?.value).toBe('12 345 678 901');
      expect(match?.sensitivity).toBe('restricted_identifier');
      expect(match?.requiresConfirmation).toBe(true);
      expect(match?.aiAccessPermitted).toBe(false);
    });

    it('matches US Driver License State via alias', () => {
      const match = semanticProfileMatcher.match(
        createMockField('Driver License Issuing State', 'dl_state'),
        mockProfile
      );
      expect(match).not.toBeNull();
      expect(match?.source).toBe('country_pack');
      expect(match?.fieldKey).toBe('US-pack_us_driver_license_state');
      expect(match?.value).toBe('CA');
      expect(match?.sensitivity).toBe('ordinary');
    });

    it('matches UK National Insurance Number with strict confirmation', () => {
      const match = semanticProfileMatcher.match(
        createMockField('National Insurance Number', 'ni_number'),
        mockProfile
      );
      expect(match).not.toBeNull();
      expect(match?.source).toBe('country_pack');
      expect(match?.fieldKey).toBe('GB-pack_gb_ni_number');
      expect(match?.value).toBe('QQ 12 34 56 A');
      expect(match?.requiresConfirmation).toBe(true);
      expect(match?.aiAccessPermitted).toBe(false);
    });
  });
});
