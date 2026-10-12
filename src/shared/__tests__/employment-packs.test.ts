import { describe, it, expect, beforeEach } from 'vitest';
import {
  BUILTIN_EMPLOYMENT_PACKS,
  CS_PACK,
  DESIGN_PACK,
  DATA_SCIENCE_PACK,
  getBuiltinPacks,
  getAllPacks,
  getActivePackIds,
  setActivePackIds,
  getActivePacks,
  togglePackActive,
  saveCustomPack,
  deleteCustomPack,
  validateEmploymentPackJson,
  generateEmploymentPackTemplate,
  type EmploymentPack,
} from '../employment-packs';
import { SemanticProfileMatcher } from '../semantic-profile-matcher';
import type { UserProfile } from '../profile';
import type { FieldSchema } from '../types';

describe('Employment Packs Specification & Built-ins', () => {
  it('loads all built-in employment packs', () => {
    const builtin = getBuiltinPacks();
    expect(builtin.length).toBe(3);
    const ids = builtin.map(p => p.id);
    expect(ids).toContain('cs-pack');
    expect(ids).toContain('design-pack');
    expect(ids).toContain('data-science-pack');
  });

  describe('cs-pack (Software Engineering)', () => {
    it('contains all required competitive coding and repository fields', () => {
      const keys = CS_PACK.fields.map(f => f.key);
      expect(keys).toContain('leetcode_url');
      expect(keys).toContain('hackerrank_url');
      expect(keys).toContain('codeforces_url');
      expect(keys).toContain('codechef_url');
      expect(keys).toContain('github_url');
      expect(keys).toContain('gitlab_url');
      expect(keys).toContain('stackoverflow_url');
      expect(keys).toContain('kaggle_url');
    });

    it('has comprehensive aliases for competitive coding handles', () => {
      const leetcodeField = CS_PACK.fields.find(f => f.key === 'leetcode_url')!;
      expect(leetcodeField.aliases).toContain('leetcode');
      expect(leetcodeField.aliases).toContain('leetcode profile');
      expect(leetcodeField.aliases).toContain('leetcode url');

      const hackerrankField = CS_PACK.fields.find(f => f.key === 'hackerrank_url')!;
      expect(hackerrankField.aliases).toContain('hackerrank');
      expect(hackerrankField.aliases).toContain('hackerrank profile');

      const codeforcesField = CS_PACK.fields.find(f => f.key === 'codeforces_url')!;
      expect(codeforcesField.aliases).toContain('codeforces');
      expect(codeforcesField.aliases).toContain('codeforces handle');

      const codechefField = CS_PACK.fields.find(f => f.key === 'codechef_url')!;
      expect(codechefField.aliases).toContain('codechef');
      expect(codechefField.aliases).toContain('codechef handle');
    });
  });

  describe('design-pack (Product & Visual Design)', () => {
    it('contains design portfolios, Figma, Behance, and Dribbble', () => {
      const keys = DESIGN_PACK.fields.map(f => f.key);
      expect(keys).toContain('design_portfolio_url');
      expect(keys).toContain('figma_url');
      expect(keys).toContain('behance_url');
      expect(keys).toContain('dribbble_url');
      expect(keys).toContain('notion_portfolio_url');
      expect(keys).toContain('design_tools_list');
    });
  });

  describe('data-science-pack (Data & ML)', () => {
    it('contains Kaggle, Hugging Face, Google Scholar, and arXiv', () => {
      const keys = DATA_SCIENCE_PACK.fields.map(f => f.key);
      expect(keys).toContain('kaggle_url');
      expect(keys).toContain('huggingface_url');
      expect(keys).toContain('google_scholar_url');
      expect(keys).toContain('papers_url');
    });
  });
});

describe('Employment Pack Registry & Custom Packs', () => {
  beforeEach(async () => {
    await setActivePackIds(['cs-pack']);
  });

  it('manages active pack IDs with cs-pack enabled by default', async () => {
    const activeIds = await getActivePackIds();
    expect(activeIds).toContain('cs-pack');

    await togglePackActive('design-pack', true);
    let updated = await getActivePackIds();
    expect(updated).toContain('cs-pack');
    expect(updated).toContain('design-pack');

    await togglePackActive('cs-pack', false);
    updated = await getActivePackIds();
    expect(updated).not.toContain('cs-pack');
    expect(updated).toContain('design-pack');
  });

  it('generates an annotated template for community pack contributions', () => {
    const template = generateEmploymentPackTemplate();
    expect(template.id).toBe('example-role-pack');
    expect(template.fields.length).toBeGreaterThan(0);
    expect(template.fields[0].key).toBeDefined();
    expect(template.fields[0].dataType).toBe('url');
  });

  it('validates custom employment pack JSON schema', () => {
    const validPackJson = JSON.stringify({
      id: 'finance-pack',
      name: 'Quantitative Finance & Banking',
      discipline: 'Finance',
      icon: '📊',
      version: '1.0.0',
      description: 'Bloomberg terminal handles, CFA status, and model portfolios.',
      fields: [
        {
          key: 'bloomberg_handle',
          label: 'Bloomberg Terminal Handle',
          dataType: 'text',
          aliases: ['bloomberg', 'bloomberg handle'],
          placeholder: 'JDoe123',
        },
      ],
    });

    const res = validateEmploymentPackJson(validPackJson);
    expect(res.valid).toBe(true);
    expect(res.pack?.id).toBe('finance-pack');
    expect(res.pack?.fields[0].key).toBe('bloomberg_handle');
  });

  it('rejects invalid pack JSON schemas with descriptive errors', () => {
    const invalidPack1 = JSON.stringify({ id: 'bad pack with spaces' });
    const res1 = validateEmploymentPackJson(invalidPack1);
    expect(res1.valid).toBe(false);
    expect(res1.error).toMatch(/id/i);

    const invalidPack2 = JSON.stringify({
      id: 'sales-pack',
      name: 'Sales',
      fields: [],
    });
    const res2 = validateEmploymentPackJson(invalidPack2);
    expect(res2.valid).toBe(false);
    expect(res2.error).toMatch(/non-empty array/i);
  });

  it('saves and deletes custom packs in storage', async () => {
    const customPack: EmploymentPack = {
      id: 'cybersec-pack',
      name: 'Cybersecurity & Infosec',
      discipline: 'Security',
      icon: '🛡️',
      version: '1.0.0',
      description: 'TryHackMe, HackTheBox, Bugcrowd, and CVE profiles.',
      fields: [
        {
          id: 'sec_tryhackme',
          key: 'tryhackme_url',
          label: 'TryHackMe Profile',
          dataType: 'url',
          aliases: ['tryhackme', 'thm profile'],
          sensitivity: 'ordinary',
        },
      ],
    };

    await saveCustomPack(customPack);
    const all = await getAllPacks();
    expect(all.some(p => p.id === 'cybersec-pack')).toBe(true);

    const active = await getActivePackIds();
    expect(active).toContain('cybersec-pack');

    await deleteCustomPack('cybersec-pack');
    const allAfter = await getAllPacks();
    expect(allAfter.some(p => p.id === 'cybersec-pack')).toBe(false);
  });
});

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

describe('Semantic Profile Matcher Integration with Employment Packs', () => {
  const matcher = new SemanticProfileMatcher();

  const mockProfile: UserProfile = {
    personal: {
      firstName: 'Alex',
      lastName: 'Chen',
      email: 'alex.chen@example.com',
      phone: '+1 555-0199',
      location: 'San Francisco, CA',
    },
    professional: { currentRole: '', currentCompany: '', noticePeriod: '' },
    work: [],
    education: [],
    skills: ['TypeScript', 'Python'],
    lastUpdated: Date.now(),
    employmentPacksData: {
      'cs-pack': {
        leetcode_url: 'https://leetcode.com/u/alexchen/',
        hackerrank_url: 'https://hackerrank.com/alexchen',
        codeforces_url: 'https://codeforces.com/profile/alexchen',
        codechef_url: 'https://codechef.com/users/alexchen',
        github_url: 'https://github.com/alexchen',
        tech_blog_url: 'https://dev.to/alexchen',
      },
      'design-pack': {
        design_portfolio_url: 'https://alexchen.design',
        behance_url: 'https://behance.net/alexchen',
        dribbble_url: 'https://dribbble.com/alexchen',
        figma_url: 'https://figma.com/@alexchen',
      },
    },
  };

  it('matches LeetCode profile field on ATS forms', () => {
    const match = matcher.match(
      createMockField('LeetCode Profile Link', 'candidate_leetcode'),
      mockProfile
    );
    expect(match).not.toBeNull();
    expect(match?.value).toBe('https://leetcode.com/u/alexchen/');
    expect(match?.source).toBe('employment_pack');
    expect(match?.fieldKey).toBe('cs-pack_leetcode_url');
  });

  it('matches HackerRank profile field on ATS forms', () => {
    const match = matcher.match(
      createMockField('HackerRank Profile', 'hackerrank_url'),
      mockProfile
    );
    expect(match).not.toBeNull();
    expect(match?.value).toBe('https://hackerrank.com/alexchen');
    expect(match?.source).toBe('employment_pack');
  });

  it('matches Codeforces handle field on ATS forms', () => {
    const match = matcher.match(
      createMockField('Codeforces Username / Handle', 'codeforces_handle'),
      mockProfile
    );
    expect(match).not.toBeNull();
    expect(match?.value).toBe('https://codeforces.com/profile/alexchen');
    expect(match?.source).toBe('employment_pack');
  });

  it('matches CodeChef profile field on ATS forms', () => {
    const match = matcher.match(
      createMockField('CodeChef Profile URL', 'codechef_user'),
      mockProfile
    );
    expect(match).not.toBeNull();
    expect(match?.value).toBe('https://codechef.com/users/alexchen');
    expect(match?.source).toBe('employment_pack');
  });

  it('matches GitHub URL field on ATS forms', () => {
    const match = matcher.match(
      createMockField('GitHub Repository / Account', 'github_profile'),
      mockProfile
    );
    expect(match).not.toBeNull();
    expect(match?.value).toBe('https://github.com/alexchen');
    expect(match?.source).toBe('employment_pack');
  });

  it('matches Design Portfolio and Behance on creative forms', () => {
    const portMatch = matcher.match(
      createMockField('Design Portfolio URL', 'portfolio_site'),
      mockProfile
    );
    expect(portMatch).not.toBeNull();
    expect(portMatch?.value).toBe('https://alexchen.design');
    expect(portMatch?.source).toBe('employment_pack');

    const behanceMatch = matcher.match(
      createMockField('Behance Portfolio Link', 'behance_profile'),
      mockProfile
    );
    expect(behanceMatch).not.toBeNull();
    expect(behanceMatch?.value).toBe('https://behance.net/alexchen');
  });
});
