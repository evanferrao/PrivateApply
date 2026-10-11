import { describe, it, expect } from 'vitest';
import {
  calculateDerivedExperience,
  createDefaultIndiaPack,
  createDefaultCompliance,
  createDefaultCustomField,
} from '../applicant-profile';

describe('Applicant Profile - Derived Experience Calculator', () => {
  it('calculates 0 experience when no records provided', () => {
    const summary = calculateDerivedExperience([]);
    expect(summary.totalExperienceYears).toBe(0);
    expect(summary.totalExperienceMonths).toBe(0);
    expect(summary.displayTotalExperience).toBe('0 years');
    expect(summary.totalEmployersCount).toBe(0);
  });

  it('calculates full-time experience correctly across multiple jobs', () => {
    const records = [
      {
        employerName: 'Company A',
        startDate: '2020-01-01',
        endDate: '2022-01-01', // 24 months = 2.0 years
        employmentType: 'full_time',
        currentlyEmployed: false,
      },
      {
        employerName: 'Company B',
        startDate: '2022-01-01',
        endDate: '2023-07-01', // 18 months = 1.5 years
        employmentType: 'full_time',
        currentlyEmployed: false,
      },
    ];

    const summary = calculateDerivedExperience(records);
    expect(summary.totalExperienceMonths).toBe(42);
    expect(summary.totalExperienceYears).toBe(3.5);
    expect(summary.fullTimeYears).toBe(3.5);
    expect(summary.totalEmployersCount).toBe(2);
  });

  it('separates internship and part-time experience weights', () => {
    const records = [
      {
        employerName: 'Startup Inc',
        startDate: '2021-06-01',
        endDate: '2021-12-01', // 6 months internship
        employmentType: 'internship',
      },
      {
        employerName: 'Tech Corp',
        startDate: '2022-01-01',
        endDate: '2023-01-01', // 12 months full-time
        employmentType: 'full_time',
      },
      {
        employerName: 'Consulting',
        startDate: '2023-01-01',
        endDate: '2024-01-01', // 12 months part-time (weighted at 50% = 6 months)
        employmentType: 'part_time',
      },
    ];

    const summary = calculateDerivedExperience(records);
    expect(summary.internshipMonths).toBe(6);
    expect(summary.fullTimeYears).toBe(1);
    expect(summary.totalExperienceMonths).toBe(18); // 12 FT + 6 PT
    expect(summary.totalEmployersCount).toBe(3);
  });

  it('excludes internships and open source roles when countsTowardsExperience is false', () => {
    const records = [
      {
        employerName: 'Citrine Investments',
        jobTitle: 'DevOps Intern',
        startDate: '2026-04-01',
        endDate: '2026-06-01',
        employmentType: 'internship' as const,
        countsTowardsExperience: false,
      },
      {
        employerName: 'Android Open Source Project',
        jobTitle: 'crDroid Maintainer',
        startDate: '2020-04-01',
        endDate: '2023-07-01',
        employmentType: 'open_source' as const,
        countsTowardsExperience: false,
      },
    ];

    const summary = calculateDerivedExperience(records as any);
    expect(summary.totalExperienceYears).toBe(0);
    expect(summary.totalExperienceMonths).toBe(0);
    expect(summary.fullTimeYears).toBe(0);
    expect(summary.totalEmployersCount).toBe(0);
    expect(summary.displayTotalExperience).toBe('0 years');
  });

  it('respects experienceOverrides directly when user customizes stats', () => {
    const records = [
      {
        employerName: 'Some Company',
        startDate: '2020-01-01',
        endDate: '2023-01-01',
        employmentType: 'full_time' as const,
      },
    ];

    const overrides = {
      isOverridden: true,
      totalExperienceYears: 0,
      fullTimeYears: 0,
      currentEmployerTenureYears: 0,
      totalEmployersCount: 0,
      displayTotalExperience: '0 years (Fresher)',
    };

    const summary = calculateDerivedExperience(records as any, overrides);
    expect(summary.isOverridden).toBe(true);
    expect(summary.totalExperienceYears).toBe(0);
    expect(summary.totalEmployersCount).toBe(0);
    expect(summary.displayTotalExperience).toBe('0 years (Fresher)');
  });
});

describe('Applicant Profile - Default Initializers', () => {
  it('creates valid default India Recruitment Pack', () => {
    const pack = createDefaultIndiaPack();
    expect(pack.enabled).toBe(false);
    expect(pack.willingToSignBond).toBe(false);
    expect(pack.activeBacklogsCount).toBe(0);
    expect(pack.dayScholarOrHosteller).toBe('day_scholar');
  });

  it('creates valid default background compliance settings', () => {
    const comp = createDefaultCompliance();
    expect(comp.educationVerificationConsent).toBe(true);
    expect(comp.accurateDeclaration).toBe(true);
    expect(comp.criminalRecordDeclared).toBe(false);
  });

  it('creates custom field definition with specified attributes', () => {
    const cf = createDefaultCustomField(
      'father_occupation',
      "Father's Occupation",
      'family',
      'text',
      ["father's profession", "dad's work"]
    );

    expect(cf.key).toBe('father_occupation');
    expect(cf.label).toBe("Father's Occupation");
    expect(cf.sectionId).toBe('family');
    expect(cf.dataType).toBe('text');
    expect(cf.aliases).toContain("father's profession");
    expect(cf.sensitivity).toBe('ordinary');
    expect(cf.aiAccessPermitted).toBe(true);
  });
});
