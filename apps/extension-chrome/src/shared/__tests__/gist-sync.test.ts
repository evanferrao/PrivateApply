import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  extractGistId,
  reconcileProfileSchema,
  createCanonicalTemplateProfile,
  testGistConnection,
  createSecretGist,
  pushToGist,
  pullFromGist,
  getGistSyncConfig,
  saveGistSyncConfig,
  CURRENT_GIST_SCHEMA_VERSION,
  GIST_FILENAME,
} from '../gist-sync';
import { chromeCompat } from '../browser-compat';

describe('GitHub Secret Gist Sync & Schema Evolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('extractGistId', () => {
    it('extracts raw hex gist id', () => {
      const id = '8f64a13d7120e29b1248abcdef123456';
      expect(extractGistId(id)).toBe(id);
    });

    it('extracts gist id from full GitHub Gist URL with username', () => {
      const url = 'https://gist.github.com/octocat/8f64a13d7120e29b1248abcdef123456';
      expect(extractGistId(url)).toBe('8f64a13d7120e29b1248abcdef123456');
    });

    it('extracts gist id from URL without username and trailing slash', () => {
      const url = 'https://gist.github.com/8f64a13d7120e29b1248abcdef123456/';
      expect(extractGistId(url)).toBe('8f64a13d7120e29b1248abcdef123456');
    });

    it('returns null for empty or invalid input', () => {
      expect(extractGistId('')).toBeNull();
      expect(extractGistId('   ')).toBeNull();
    });
  });

  describe('reconcileProfileSchema - Forward & Backward Compatibility', () => {
    it('creates canonical template with blank defaults', () => {
      const template = createCanonicalTemplateProfile();
      expect(template.personal.firstName).toBe('');
      expect(template.personal.email).toBe('');
      expect(template.certifications).toEqual([]);
      expect(template.legalDisclosures).toBeDefined();
      expect(template.workPreferences).toBeDefined();
    });

    it('forward compatibility: old JSON without newly added fields initializes them as blank/defaults', () => {
      // Legacy JSON from older version missing certifications, passport, questionBank, employmentPacksData
      const legacyProfile = {
        personal: {
          firstName: 'Alice',
          lastName: 'Smith',
          email: 'alice@example.com',
        },
        skills: ['TypeScript', 'React'],
      };

      const result = reconcileProfileSchema(legacyProfile, 2);

      // Existing fields preserved
      expect(result.reconciledProfile.personal.firstName).toBe('Alice');
      expect(result.reconciledProfile.personal.email).toBe('alice@example.com');
      expect(result.reconciledProfile.skills).toEqual(['TypeScript', 'React']);

      // Newly added fields initialized as blank/default
      expect(result.reconciledProfile.certifications).toEqual([]);
      expect(result.reconciledProfile.passport?.passportNumber).toBe('');
      expect(result.reconciledProfile.employmentPacksData).toEqual({});
      expect(result.reconciledProfile.legalDisclosures.requiresSponsorship).toBe(false);

      // Recorded in addedFields
      expect(result.addedFields).toContain('certifications');
      expect(result.addedFields).toContain('passport');
    });

    it('best-try effort: preserves data types without unnecessary resets', () => {
      const incoming = {
        personal: {
          firstName: 'Bob',
          phone: '+1 555-123-4567',
          location: 'San Francisco, CA',
        },
        professional: {
          linkedin: 'https://linkedin.com/in/bob',
          github: 'https://github.com/bob',
          otherLinks: ['https://bob.dev'],
        },
        skills: ['Go', 'Kubernetes'],
      };

      const result = reconcileProfileSchema(incoming, 2);
      expect(result.reconciledProfile.personal.firstName).toBe('Bob');
      expect(result.reconciledProfile.personal.phone).toBe('+1 555-123-4567');
      expect(result.reconciledProfile.professional?.linkedin).toBe('https://linkedin.com/in/bob');
      expect(result.reconciledProfile.skills).toEqual(['Go', 'Kubernetes']);
    });

    it('best-try effort: coerces numeric values to string losslessly', () => {
      const incoming = {
        personal: {
          firstName: 12345, // numeric input
          email: 'num@test.com',
        },
        legalDisclosures: {
          requiresSponsorship: 'true', // stringified boolean
        },
      };

      const result = reconcileProfileSchema(incoming, 2);
      expect(result.reconciledProfile.personal.firstName).toBe('12345');
      expect(result.reconciledProfile.legalDisclosures.requiresSponsorship).toBe(true);
    });

    it('overrides modified/incompatible fields and asks user to fill again', () => {
      // Incompatible field types (e.g. object instead of string or incompatible array)
      const incoming = {
        personal: {
          firstName: { complex: 'invalid_object' }, // modified/broken type
        },
        professional: {
          linkedin: { url: 'https://broken.com' }, // modified type
        },
      };

      const result = reconcileProfileSchema(incoming, 2);

      // Value was overridden with default/blank
      expect(result.reconciledProfile.personal.firstName).toBe('');
      expect(result.reconciledProfile.professional?.linkedin).toBe('');

      // Flagged for user notice
      expect(result.hasModifications).toBe(true);
      expect(result.modifiedFields.some(m => m.path === 'personal.firstName')).toBe(true);
      expect(result.modifiedFields.some(m => m.path === 'professional.linkedin')).toBe(true);
    });

    it('applies schema migrations when source version is older', () => {
      // Migration registered for personal.phone in version 2
      const incoming = {
        personal: {
          firstName: 'Charlie',
          phone: '9999999999',
        },
      };

      // Pulling from schema version 1 into version 2
      const result = reconcileProfileSchema(incoming, 1);

      expect(result.reconciledProfile.personal.phone).toBe('');
      expect(result.hasModifications).toBe(true);
      const phoneNotice = result.modifiedFields.find(m => m.path === 'personal.phone');
      expect(phoneNotice).toBeDefined();
      expect(phoneNotice?.reason).toContain('Phone format upgraded');
    });

    it('gracefully handles empty or corrupted incoming payload', () => {
      const result = reconcileProfileSchema(null, 1);
      expect(result.reconciledProfile).toBeDefined();
      expect(result.hasModifications).toBe(true);
    });
  });

  describe('testGistConnection', () => {
    it('returns success and username on HTTP 200', async () => {
      (globalThis.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ login: 'octocat' }),
      });

      const res = await testGistConnection('ghp_valid_token_123');
      expect(res.success).toBe(true);
      expect(res.username).toBe('octocat');
    });

    it('returns error on HTTP 401 unauthorized', async () => {
      (globalThis.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      const res = await testGistConnection('ghp_bad_token');
      expect(res.success).toBe(false);
      expect(res.error).toContain('Invalid token');
    });
  });

  describe('createSecretGist', () => {
    it('posts an unlisted gist with proper filename and payload', async () => {
      let requestBody: any = null;
      (globalThis.fetch as any).mockImplementationOnce(async (url: string, opts: any) => {
        requestBody = JSON.parse(opts.body);
        return {
          ok: true,
          status: 201,
          json: async () => ({
            id: 'new_gist_id_1234567890123456',
            html_url: 'https://gist.github.com/octocat/new_gist_id_1234567890123456',
          }),
        };
      });

      const res = await createSecretGist('ghp_test_token_123');
      expect(res.success).toBe(true);
      expect(res.gistId).toBe('new_gist_id_1234567890123456');
      expect(requestBody.public).toBe(false); // MUST be secret
      expect(requestBody.files[GIST_FILENAME]).toBeDefined();
    });
  });

  describe('pushToGist & pullFromGist', () => {
    it('pushToGist updates existing gist with PATCH', async () => {
      let patchUrl = '';
      (globalThis.fetch as any).mockImplementationOnce(async (url: string) => {
        patchUrl = url;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            html_url: 'https://gist.github.com/octocat/gist1234567890123456',
          }),
        };
      });

      const res = await pushToGist({
        patToken: 'ghp_token',
        gistId: 'gist1234567890123456',
      });

      expect(res.success).toBe(true);
      expect(patchUrl).toContain('/gists/gist1234567890123456');
    });

    it('pullFromGist retrieves and reconciles configuration', async () => {
      const gistContent = JSON.stringify({
        schemaVersion: 2,
        activeProfile: {
          personal: {
            firstName: 'Diana',
            lastName: 'Prince',
            email: 'diana@themyscira.gov',
          },
        },
      });

      (globalThis.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          html_url: 'https://gist.github.com/octocat/gist1234567890123456',
          files: {
            [GIST_FILENAME]: {
              content: gistContent,
            },
          },
        }),
      });

      const res = await pullFromGist({
        patToken: 'ghp_token',
        gistId: 'gist1234567890123456',
      });

      expect(res.success).toBe(true);
      expect(res.reconciliation?.reconciledProfile.personal.firstName).toBe('Diana');
      expect(res.reconciliation?.addedFields).toContain('certifications');
    });
  });
});
