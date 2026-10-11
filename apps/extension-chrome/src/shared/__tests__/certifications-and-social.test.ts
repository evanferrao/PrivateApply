import { describe, it, expect } from 'vitest';
import { SemanticProfileMatcher } from '../semantic-profile-matcher';
import type { UserProfile, CertificationRecord } from '../profile';
import type { FieldSchema } from '../types';
import { matchFieldToProfile } from '../autofill';

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

describe('Certifications & Social Links Integration', () => {
  const matcher = new SemanticProfileMatcher();

  const mockCerts: CertificationRecord[] = [
    {
      id: 'cert_aws_saa',
      name: 'AWS Certified Solutions Architect – Associate',
      issuer: 'Amazon Web Services',
      issuerAliases: ['AWS', 'Amazon', 'AWS Cloud'],
      examCode: 'SAA-C03',
      credentialId: 'AWS-ASA-948192',
      verificationUrl: 'https://www.credly.com/badges/aws-saa-sample',
      issueDate: '2023-04-15',
      doesNotExpire: true,
      scoreOrGrade: '890/1000',
      skillsCovered: ['Cloud Architecture', 'AWS', 'IAM', 'VPC', 'S3'],
    },
    {
      id: 'cert_cka',
      name: 'Certified Kubernetes Administrator',
      issuer: 'Cloud Native Computing Foundation',
      issuerAliases: ['CNCF', 'Linux Foundation', 'Kubernetes'],
      examCode: 'CKA',
      credentialId: 'CKA-98765432',
      verificationUrl: 'https://www.credly.com/badges/cka-sample',
      issueDate: '2022-09-10',
      expiryDate: '2025-09-10',
      doesNotExpire: false,
      scoreOrGrade: 'Pass',
      skillsCovered: ['Kubernetes', 'Containers', 'DevOps'],
    },
  ];

  const mockProfile: UserProfile = {
    personal: {
      firstName: 'Sarah',
      lastName: 'Connor',
      email: 'sarah.connor@example.com',
      phone: '+1 555-0144',
      location: 'Austin, TX',
    },
    professional: {
      linkedin: 'https://linkedin.com/in/sarahconnor',
      github: 'https://github.com/sarahconnor',
      portfolio: 'https://sarahconnor.tech',
      twitter: 'https://x.com/sarahconnor',
      youtube: 'https://youtube.com/@sarahconnor_dev',
      instagram: 'https://instagram.com/sarahconnor.codes',
      facebook: 'https://facebook.com/sarahconnor.official',
      threads: 'https://threads.net/@sarahconnor.codes',
      bluesky: 'https://bsky.app/profile/sarahconnor.bsky.social',
      medium: 'https://medium.com/@sarahconnor',
    },
    work: [],
    education: [],
    skills: ['AWS', 'Kubernetes', 'Go', 'TypeScript'],
    certifications: mockCerts,
    lastUpdated: Date.now(),
  };

  describe('Certifications Matching with Organization Aliases', () => {
    it('matches certification by exact certification title', () => {
      const field = createMockField('AWS Certified Solutions Architect – Associate');
      const match = matcher.match(field, mockProfile);
      expect(match).not.toBeNull();
      expect(match?.source).toBe('certification');
      expect(match?.value).toBe('AWS Certified Solutions Architect – Associate');
      expect(match?.fieldKey).toBe('cert_cert_aws_saa_name');
    });

    it('matches certification by official issuing organization name', () => {
      const field = createMockField('Amazon Web Services Cloud Certification');
      const match = matcher.match(field, mockProfile);
      expect(match).not.toBeNull();
      expect(match?.source).toBe('certification');
      expect(match?.value).toBe('AWS Certified Solutions Architect – Associate');
    });

    it('matches certification using organization alias (e.g. "AWS")', () => {
      const field = createMockField('Do you hold any AWS certifications?', 'aws_cert');
      const match = matcher.match(field, mockProfile);
      expect(match).not.toBeNull();
      expect(match?.source).toBe('certification');
      expect(match?.value).toBe('Yes');
    });

    it('matches second certification using secondary alias (e.g. "Linux Foundation" or "CNCF")', () => {
      const field = createMockField('CNCF Kubernetes Certification');
      const match = matcher.match(field, mockProfile);
      expect(match).not.toBeNull();
      expect(match?.source).toBe('certification');
      expect(match?.value).toBe('Certified Kubernetes Administrator');
    });

    it('matches certification by exam code (e.g. SAA-C03, CKA)', () => {
      const field = createMockField('SAA-C03 Certification');
      const match = matcher.match(field, mockProfile);
      expect(match).not.toBeNull();
      expect(match?.source).toBe('certification');
      expect(match?.value).toBe('AWS Certified Solutions Architect – Associate');
    });

    it('resolves credential verification URL / Credly link', () => {
      const field = createMockField('AWS Credential Verification Link / Credly URL', 'cert_url');
      const match = matcher.match(field, mockProfile);
      expect(match).not.toBeNull();
      expect(match?.source).toBe('certification');
      expect(match?.value).toBe('https://www.credly.com/badges/aws-saa-sample');
      expect(match?.fieldKey).toBe('cert_cert_aws_saa_verification_url');
    });

    it('resolves credential ID / license number', () => {
      const field = createMockField('AWS Certification Credential ID', 'license_num');
      const match = matcher.match(field, mockProfile);
      expect(match).not.toBeNull();
      expect(match?.source).toBe('certification');
      expect(match?.value).toBe('AWS-ASA-948192');
      expect(match?.fieldKey).toBe('cert_cert_aws_saa_credential_id');
    });

    it('resolves exam code specifically', () => {
      const field = createMockField('AWS Exam Code', 'exam_code');
      const match = matcher.match(field, mockProfile);
      expect(match).not.toBeNull();
      expect(match?.source).toBe('certification');
      expect(match?.value).toBe('SAA-C03');
    });

    it('resolves issue date', () => {
      const field = createMockField('AWS Certification Issue Date', 'cert_issue_date');
      const match = matcher.match(field, mockProfile);
      expect(match).not.toBeNull();
      expect(match?.source).toBe('certification');
      expect(match?.value).toBe('2023-04-15');
    });

    it('respects lifetime validity (doesNotExpire = true)', () => {
      const field = createMockField('AWS Certification Expiry Date', 'cert_expiry');
      const match = matcher.match(field, mockProfile);
      expect(match).not.toBeNull();
      expect(match?.source).toBe('certification');
      expect(match?.value).toBe('Does not expire');
    });

    it('resolves expiry date for expiring certifications', () => {
      const field = createMockField('CKA Kubernetes Expiration Date', 'cka_expiry');
      const match = matcher.match(field, mockProfile);
      expect(match).not.toBeNull();
      expect(match?.source).toBe('certification');
      expect(match?.value).toBe('2025-09-10');
    });

    it('answers general "Do you hold any certifications?" checkbox with true', () => {
      const field = createMockField('Do you hold any professional certifications or licenses?', 'has_certs', '', 'checkbox');
      const match = matcher.match(field, mockProfile);
      expect(match).not.toBeNull();
      expect(match?.source).toBe('certification');
      expect(match?.value).toBe(true);
    });

    it('summarizes all certifications in general certifications textarea', () => {
      const field = createMockField('List of Professional Certifications & Licenses', 'cert_summary');
      const match = matcher.match(field, mockProfile);
      expect(match).not.toBeNull();
      expect(match?.source).toBe('certification');
      expect(String(match?.value)).toContain('AWS Certified Solutions Architect – Associate');
      expect(String(match?.value)).toContain('Certified Kubernetes Administrator');
    });
  });

  describe('Social Media & Channel Links Matching', () => {
    it('matches Twitter / X URL and handle', () => {
      const field = createMockField('Twitter / X Profile URL', 'candidate_twitter');
      const match = matcher.match(field, mockProfile);
      expect(match).not.toBeNull();
      expect(match?.source).toBe('social_link');
      expect(match?.value).toBe('https://x.com/sarahconnor');
    });

    it('matches YouTube Channel or Video Portfolio', () => {
      const field = createMockField('YouTube Channel', 'youtube_url');
      const match = matcher.match(field, mockProfile);
      expect(match).not.toBeNull();
      expect(match?.source).toBe('social_link');
      expect(match?.value).toBe('https://youtube.com/@sarahconnor_dev');
    });

    it('matches Instagram Profile', () => {
      const field = createMockField('Instagram Profile URL', 'instagram_link');
      const match = matcher.match(field, mockProfile);
      expect(match).not.toBeNull();
      expect(match?.source).toBe('social_link');
      expect(match?.value).toBe('https://instagram.com/sarahconnor.codes');
    });

    it('matches Facebook Profile', () => {
      const field = createMockField('Facebook Profile', 'facebook_url');
      const match = matcher.match(field, mockProfile);
      expect(match).not.toBeNull();
      expect(match?.source).toBe('social_link');
      expect(match?.value).toBe('https://facebook.com/sarahconnor.official');
    });

    it('matches Threads Profile', () => {
      const field = createMockField('Threads Profile URL', 'threads_url');
      const match = matcher.match(field, mockProfile);
      expect(match).not.toBeNull();
      expect(match?.source).toBe('social_link');
      expect(match?.value).toBe('https://threads.net/@sarahconnor.codes');
    });

    it('matches Bluesky Profile', () => {
      const field = createMockField('Bluesky Profile URL', 'bsky_link');
      const match = matcher.match(field, mockProfile);
      expect(match).not.toBeNull();
      expect(match?.source).toBe('social_link');
      expect(match?.value).toBe('https://bsky.app/profile/sarahconnor.bsky.social');
    });

    it('matches Medium / Tech Blog URL', () => {
      const field = createMockField('Medium Profile / Tech Blog', 'medium_blog');
      const match = matcher.match(field, mockProfile);
      expect(match).not.toBeNull();
      expect(match?.source).toBe('social_link');
      expect(match?.value).toBe('https://medium.com/@sarahconnor');
    });
  });

  describe('Autofill Matching for Social and Certifications', () => {
    it('autofills Twitter URL via matchFieldToProfile', () => {
      const val = matchFieldToProfile(createMockField('Twitter URL', 'twitter', 'twitter_url'), mockProfile);
      expect(val).toBe('https://x.com/sarahconnor');
    });

    it('autofills YouTube URL via matchFieldToProfile', () => {
      const val = matchFieldToProfile(createMockField('YouTube Channel', 'youtube', 'yt'), mockProfile);
      expect(val).toBe('https://youtube.com/@sarahconnor_dev');
    });

    it('autofills Instagram URL via matchFieldToProfile', () => {
      const val = matchFieldToProfile(createMockField('Instagram Profile', 'instagram', 'ig'), mockProfile);
      expect(val).toBe('https://instagram.com/sarahconnor.codes');
    });

    it('autofills Facebook URL via matchFieldToProfile', () => {
      const val = matchFieldToProfile(createMockField('Facebook URL', 'facebook', 'fb'), mockProfile);
      expect(val).toBe('https://facebook.com/sarahconnor.official');
    });

    it('autofills Bluesky Profile via matchFieldToProfile', () => {
      const val = matchFieldToProfile(createMockField('Bluesky Profile', 'bluesky', 'bsky'), mockProfile);
      expect(val).toBe('https://bsky.app/profile/sarahconnor.bsky.social');
    });

    it('autofills Certification Credential ID via matchFieldToProfile', () => {
      const val = matchFieldToProfile(createMockField('Credential ID', 'credential_id', 'cred_id'), mockProfile);
      expect(val).toBe('AWS-ASA-948192');
    });
  });
});
