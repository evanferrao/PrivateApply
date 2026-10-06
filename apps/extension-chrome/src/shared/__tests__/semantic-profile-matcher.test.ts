import { describe, it, expect } from 'vitest';
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

describe('SemanticProfileMatcher', () => {
  const mockProfile: UserProfile = {
    personal: {
      firstName: 'Aarav',
      lastName: 'Sharma',
      email: 'aarav.sharma@example.com',
      phone: '+91 9876543210',
      alternatePhone: '+91 9123456789',
      location: 'Bengaluru, Karnataka, India',
    },
    professional: {
      yearsOfExperience: 3,
      noticePeriodDays: 30,
      noticePeriod: '30 days',
      workPreference: 'hybrid',
    },
    work: [
      {
        company: 'Innovatech',
        title: 'Software Development Engineer',
        startDate: '2021-06-01',
        endDate: '2024-06-01',
        current: true,
        description: 'Full stack development',
      },
    ],
    education: [
      {
        school: 'National Institute of Technology',
        degree: 'B.Tech',
        field: 'Computer Science',
        graduationYear: '2021',
      },
    ],
    skills: ['TypeScript', 'React', 'Node.js'],
    lastUpdated: Date.now(),

    // Extended catalogues
    familyContacts: [
      {
        id: 'fc_1',
        relationship: 'father',
        name: 'Ramesh Sharma',
        phone: '+91 9811122233',
        occupation: 'Civil Engineer',
        employer: 'State Infrastructure Corp',
      },
      {
        id: 'fc_2',
        relationship: 'mother',
        name: 'Sunita Sharma',
        phone: '+91 9844455566',
        occupation: 'Professor of Mathematics',
      },
      {
        id: 'fc_3',
        relationship: 'emergency',
        name: 'Vikram Sharma',
        phone: '+91 9900011223',
        isEmergencyContact: true,
      },
    ],

    indiaPack: {
      enabled: true,
      tenthPercentage: 94.6,
      tenthPassingYear: '2015',
      tenthBoard: 'CBSE',
      twelfthPercentage: 92.4,
      twelfthPassingYear: '2017',
      twelfthBoard: 'CBSE',
      undergradCgpa: 8.75,
      studentRegistrationNumber: 'NITK17CS042',
      activeBacklogsCount: 0,
      clearedBacklogsCount: 1,
      historyOfArrears: true,
      educationGapYears: 0,
      currentCtcLpa: 12.5,
      expectedCtcLpa: 18.0,
      willingToSignBond: true,
      aadhaarNumberMasked: 'XXXX-XXXX-4321',
      panNumberMasked: 'ABCPS1234D',
    },

    customFields: [
      {
        id: 'cf_1',
        key: 'hackathon_rank',
        label: 'Smart India Hackathon Rank',
        sectionId: 'custom',
        dataType: 'text',
        aliases: ['hackathon rank', 'sih position', 'national competition rank'],
        value: '1st Runner Up (Grand Finale)',
        sensitivity: 'ordinary',
        aiAccessPermitted: true,
        autoFillPermitted: true,
        requiresConfirmation: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],

    questionBank: [
      {
        id: 'qb_1',
        question: 'Why do you want to join our engineering team?',
        aliases: ['why join us', 'why this company', 'why are you interested in this role'],
        answer: 'I thrive in building scalable, resilient distributed systems and admire your focus on developer productivity and privacy.',
        category: 'narrative',
        isVerified: true,
        companyScoped: false,
        lastUpdated: Date.now(),
      },
    ],
  };

  describe('Entity Disambiguation - Alternate Phone vs Primary Phone', () => {
    it('maps alternate phone labels strictly to alternatePhone', () => {
      const match = semanticProfileMatcher.match(
        createMockField('Alternate Contact Number', 'alt_phone'),
        mockProfile
      );
      expect(match).not.toBeNull();
      expect(match?.fieldKey).toBe('alternate_phone');
      expect(match?.value).toBe('+91 9123456789');
    });

    it('maps secondary phone to alternatePhone', () => {
      const match = semanticProfileMatcher.match(
        createMockField('Secondary Phone', 'secondary_phone'),
        mockProfile
      );
      expect(match).not.toBeNull();
      expect(match?.fieldKey).toBe('alternate_phone');
      expect(match?.value).toBe('+91 9123456789');
    });
  });

  describe('Family & Emergency Contacts', () => {
    it("correctly resolves father's occupation without confusing it with candidate role", () => {
      const match = semanticProfileMatcher.match(
        createMockField("Father's Occupation", 'father_occupation'),
        mockProfile
      );
      expect(match).not.toBeNull();
      expect(match?.fieldKey).toBe('father_occupation');
      expect(match?.value).toBe('Civil Engineer');
      expect(match?.entity).toBe('father');
    });

    it("resolves father's mobile number", () => {
      const match = semanticProfileMatcher.match(
        createMockField("Father's Mobile Number", 'father_phone'),
        mockProfile
      );
      expect(match).not.toBeNull();
      expect(match?.fieldKey).toBe('father_phone');
      expect(match?.value).toBe('+91 9811122233');
    });

    it("resolves mother's occupation", () => {
      const match = semanticProfileMatcher.match(
        createMockField("Mother's Profession", 'mother_occupation'),
        mockProfile
      );
      expect(match).not.toBeNull();
      expect(match?.fieldKey).toBe('mother_occupation');
      expect(match?.value).toBe('Professor of Mathematics');
    });

    it('resolves emergency contact phone', () => {
      const match = semanticProfileMatcher.match(
        createMockField('Emergency Contact Phone', 'emergency_phone'),
        mockProfile
      );
      expect(match).not.toBeNull();
      expect(match?.fieldKey).toBe('emergency_phone');
      expect(match?.value).toBe('+91 9900011223');
    });
  });

  describe('India Recruitment Pack', () => {
    it('resolves Class 10 aggregate percentage', () => {
      const match = semanticProfileMatcher.match(
        createMockField('10th Percentage / Aggregate Marks', 'tenth_marks'),
        mockProfile
      );
      expect(match).not.toBeNull();
      expect(match?.fieldKey).toBe('class_10_percentage');
      expect(match?.value).toBe(94.6);
    });

    it('resolves Class 12 passing year', () => {
      const match = semanticProfileMatcher.match(
        createMockField('Class XII Year of Passing', 'twelfth_passing_year'),
        mockProfile
      );
      expect(match).not.toBeNull();
      expect(match?.fieldKey).toBe('class_12_passing_year');
      expect(match?.value).toBe('2017');
    });

    it('resolves student registration / roll number', () => {
      const match = semanticProfileMatcher.match(
        createMockField('University Roll Number / Registration No', 'student_roll_no'),
        mockProfile
      );
      expect(match).not.toBeNull();
      expect(match?.fieldKey).toBe('student_id_or_roll_no');
      expect(match?.value).toBe('NITK17CS042');
    });

    it('resolves active backlogs count', () => {
      const match = semanticProfileMatcher.match(
        createMockField('Current Active Backlogs / Arrears', 'active_backlogs'),
        mockProfile
      );
      expect(match).not.toBeNull();
      expect(match?.fieldKey).toBe('active_backlogs');
      expect(match?.value).toBe(0);
    });

    it('resolves willingness to sign service agreement bond', () => {
      const match = semanticProfileMatcher.match(
        createMockField('Are you willing to sign a service bond / employment agreement?', 'bond_agreement'),
        mockProfile
      );
      expect(match).not.toBeNull();
      expect(match?.fieldKey).toBe('service_bond_willingness');
      expect(match?.value).toBe('Yes');
    });

    it('resolves CTC in LPA', () => {
      const match = semanticProfileMatcher.match(
        createMockField('Expected CTC in LPA (INR)', 'expected_ctc_lpa'),
        mockProfile
      );
      expect(match).not.toBeNull();
      expect(match?.fieldKey).toBe('expected_ctc_lpa');
      expect(match?.value).toBe(18.0);
    });
  });

  describe('Privacy & Restricted Identifiers', () => {
    it('restricts Aadhaar number transmission and requires confirmation', () => {
      const match = semanticProfileMatcher.match(
        createMockField('Aadhaar Card Number', 'aadhaar_no'),
        mockProfile
      );
      expect(match).not.toBeNull();
      expect(match?.sensitivity).toBe('restricted_identifier');
      expect(match?.aiAccessPermitted).toBe(false);
      expect(match?.requiresConfirmation).toBe(true);
      expect(match?.value).toBe('XXXX-XXXX-4321');
    });

    it('restricts PAN number transmission and requires confirmation', () => {
      const match = semanticProfileMatcher.match(
        createMockField('PAN Card Number', 'pan_card'),
        mockProfile
      );
      expect(match).not.toBeNull();
      expect(match?.sensitivity).toBe('restricted_identifier');
      expect(match?.aiAccessPermitted).toBe(false);
      expect(match?.requiresConfirmation).toBe(true);
      expect(match?.value).toBe('ABCPS1234D');
    });
  });

  describe('Custom Fields & Question Bank', () => {
    it('matches custom field via defined alias', () => {
      const match = semanticProfileMatcher.match(
        createMockField('National Competition Rank', 'competition_rank'),
        mockProfile
      );
      expect(match).not.toBeNull();
      expect(match?.source).toBe('custom_field');
      expect(match?.fieldKey).toBe('hackathon_rank');
      expect(match?.value).toBe('1st Runner Up (Grand Finale)');
    });

    it('matches Question Bank saved response via alias', () => {
      const match = semanticProfileMatcher.match(
        createMockField('Why are you interested in this role?', 'why_role'),
        mockProfile
      );
      expect(match).not.toBeNull();
      expect(match?.source).toBe('question_bank');
      expect(match?.value).toContain('scalable, resilient distributed systems');
    });
  });
});
