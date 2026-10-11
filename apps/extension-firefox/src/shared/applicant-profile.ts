/**
 * Applicant Profile Catalogue & Schema Definitions
 *
 * Implements a comprehensive, extensible applicant profile and question bank:
 * - Full education history (Class 10, Class 12, Diploma, UG, PG, Doctorates)
 * - Detailed employment history and derived experience calculations
 * - India-specific recruitment and campus placement pack
 * - Repeatable family, guardian, and emergency contacts
 * - Repeatable professional references
 * - Extensible custom fields with sensitivity tiers and aliases
 * - Question bank for narrative and screening answers
 * - Document metadata tracking
 */
export interface PhoneDetails {
  countryCode: string;   // e.g., "+1"
  number: string;        // e.g., "5551234567"
  formatted?: string;    // e.g., "+1 (555) 123-4567" (display only)
}

export interface LocationDetails {
  street?: string;       // e.g., "742 Innovation Drive"
  city: string;          // e.g., "San Francisco"
  state: string;         // e.g., "California" or "CA"
  country: string;       // e.g., "United States"
  zipCode?: string;      // e.g., "94103" (optional)
}

export interface SelfIdentification {
  gender: string[];
  race: string[];
  orientation: string[];
  veteran: string;
  transgender: string;
  disability: string;
  age?: number;
  ageRange?: string;
  ethnicity?: string;
  citizenshipStatus?: string;
}

export interface WorkAuthorization {
  requiresSponsorship: boolean;
  legallyAuthorized: boolean;
  visaType?: string;
  sponsorshipTimeline?: string;
  currentStatus?: string;
}

export function isPhoneDetails(phone: string | PhoneDetails | undefined): phone is PhoneDetails {
  return typeof phone === 'object' && phone !== null && 'countryCode' in phone && 'number' in phone;
}

export function isLocationDetails(location: string | LocationDetails | undefined): location is LocationDetails {
  return typeof location === 'object' && location !== null && 'city' in location && 'state' in location;
}

export function formatPhone(phone: string | PhoneDetails | undefined): string {
  if (!phone) return '';
  if (isPhoneDetails(phone)) {
    return phone.formatted || `${phone.countryCode} ${phone.number}`;
  }
  return phone;
}

export function formatLocation(location: string | LocationDetails | undefined): string {
  if (!location) return '';
  if (isLocationDetails(location)) {
    const parts = [location.city, location.state, location.country].filter(Boolean);
    return parts.join(', ');
  }
  return location;
}
export type SensitivityLevel =
  | 'ordinary'              // Standard profile data: auto-fill allowed, local/remote AI allowed
  | 'sensitive_personal'   // Demographic, family, disability: confirmation recommended
  | 'restricted_identifier'; // Aadhaar, PAN, SSN, bank, passport: never sent to remote AI, requires explicit user confirmation

export interface PassportDetails {
  passportNumber: string;        // Masked, restricted identifier
  issuingCountry: string;        // Issuing country/authority
  expiryDate?: string;           // Expiration date
  issueDate?: string;            // Date of issue
  nationality?: string;          // Nationality as printed on passport
}

export interface CertificationRecord {
  id: string;                      // Unique identifier e.g. "cert_1697000000000_abc"
  name: string;                    // Certification name, e.g. "AWS Certified Solutions Architect – Associate"
  issuer: string;                  // Organization name, e.g. "Amazon Web Services"
  issuerAliases: string[];         // Aliases for the organization name, e.g. ["AWS", "Amazon", "Amazon Web Services"]
  examCode?: string;               // Exam code (optional), e.g. "SAA-C03", "AZ-104", "CKA"
  credentialId?: string;           // Credential ID / License Number (optional), e.g. "AWS-1234567"
  verificationUrl?: string;        // Verification link / Credly / badge URL (optional)
  issueDate: string;               // Date achieved (YYYY-MM-DD or YYYY-MM)
  expiryDate?: string;             // Expiry date (optional, YYYY-MM-DD or YYYY-MM)
  doesNotExpire?: boolean;         // True if credential has no expiration date / lifetime valid
  scoreOrGrade?: string;           // Score, percent or grade achieved (optional), e.g. "890 / 1000"
  skillsCovered?: string[];        // Key skills or topics covered (optional)
  description?: string;            // Overview / notes (optional)
}

export type CustomFieldValueType =
  | 'text'
  | 'number'
  | 'date'
  | 'boolean'
  | 'choice'
  | 'long_text'
  | 'repeatable'
  | 'file_ref';

export interface CustomFieldDefinition {
  id: string;
  key: string; // Canonical identifier e.g. "father_occupation", "student_roll_number"
  label: string;
  sectionId:
    | 'personal'
    | 'education'
    | 'certifications'
    | 'employment'
    | 'compensation'
    | 'work_auth'
    | 'family'
    | 'india_pack'
    | 'compliance'
    | 'references'
    | 'custom';
  customSectionName?: string;
  dataType: CustomFieldValueType;
  options?: string[]; // Allowed choices for 'choice'
  aliases: string[];  // Synonyms and employer question labels
  value?: any;
  defaultValue?: any;
  sensitivity: SensitivityLevel;
  aiAccessPermitted: boolean;
  autoFillPermitted: boolean;
  requiresConfirmation: boolean;
  tags?: string[];
  description?: string;
  createdAt: number;
  updatedAt: number;
}

export type EducationLevel =
  | 'class_10'
  | 'class_12'
  | 'diploma'
  | 'undergraduate'
  | 'postgraduate'
  | 'doctoral'
  | 'certification'
  | 'other';

export interface SemesterScore {
  semester: number | string;
  sgpa?: number;
  cgpa?: number;
  credits?: number;
  backlogs?: number;
  marksObtained?: number;
  maxMarks?: number;
}

export interface EducationRecord {
  id: string;
  level: EducationLevel;
  qualificationTitle: string; // e.g. "Secondary School Examination (Class X)", "B.Tech Computer Science"
  schoolOrInstitution: string;
  boardOrUniversity?: string; // CBSE, ICSE, State Board, VTU, Anna University...
  streamOrMajor?: string;     // Science, Commerce, Computer Science
  specialization?: string;
  country?: string;
  state?: string;
  city?: string;
  startYear?: string;
  endYear?: string;
  yearOfPassing?: string;
  resultStatus?: 'passed' | 'pursuing' | 'failed' | 'awaiting_results';
  scoreType?: 'percentage' | 'cgpa' | 'gpa' | 'marks' | 'grade';
  scoreValue?: string | number;
  scaleMax?: number; // e.g. 10.0, 4.0, 100
  marksObtained?: number;
  totalMarks?: number;
  conversionFormula?: string; // e.g. "CGPA * 9.5"
  semesters?: SemesterScore[];
  subjectScores?: Record<string, number | string>; // { Mathematics: 95, English: 90 }
  activeBacklogs?: number;
  clearedBacklogs?: number;
  totalHistoricalBacklogs?: number;
  studentIdOrRollNo?: string;
  registrationNumber?: string;
  mediumOfInstruction?: string;
  gapExplanation?: string;
}

export interface DetailedEmploymentRecord {
  id: string;
  employerName: string;
  employerType?: 'private' | 'public' | 'government' | 'nonprofit' | 'other';
  industry?: string;
  country?: string;
  city?: string;
  companyWebsite?: string;
  employmentType: 'full_time' | 'part_time' | 'contract' | 'internship' | 'freelance' | 'temporary' | 'open_source';
  jobTitle: string;
  department?: string;
  employeeId?: string;
  startDate: string; // YYYY-MM or YYYY-MM-DD
  endDate?: string;
  currentlyEmployed: boolean;
  noticePeriodDays?: number;
  noticePeriodNegotiable?: boolean;
  lastWorkingDay?: string;
  jobResponsibilities?: string;
  achievements?: string;
  startingSalary?: string | number;
  endingSalary?: string | number;
  currency?: string;
  managerName?: string;
  managerTitle?: string;
  managerEmail?: string;
  managerPhone?: string;
  hrContactName?: string;
  hrEmail?: string;
  hrPhone?: string;
  permissionToContact?: 'yes' | 'no' | 'after_offer';
  reasonForLeaving?: string;
  isInternship?: boolean;
  countsTowardsExperience?: boolean; // Set false for internships / projects that should not count in work experience
  stipend?: string;
}

export interface FamilyContact {
  id: string;
  relationship: 'father' | 'mother' | 'guardian' | 'spouse' | 'sibling' | 'emergency' | 'next_of_kin' | 'other';
  name: string;
  phone: string;
  email?: string;
  occupation?: string;
  employer?: string;
  address?: string;
  isEmergencyContact?: boolean;
  notes?: string;
}

export interface ApplicantReference {
  id: string;
  name: string;
  relationship: string; // "Former Manager", "Professor", etc.
  designation: string;
  organization: string;
  yearsKnown?: number;
  email: string;
  phone?: string;
  linkedIn?: string;
  consentGiven: boolean;
  contactTiming: 'anytime' | 'after_offer';
  notes?: string;
}

export interface CompensationDetails {
  currentAnnualCtc?: number;
  currentFixedPay?: number;
  currentVariablePay?: number;
  currentMonthlyGross?: number;
  currentMonthlyInHand?: number;
  expectedAnnualCtc?: number;
  expectedFixedSalary?: number;
  minimumAcceptableSalary?: number;
  currency: string; // e.g. "INR", "USD", "EUR"
  salaryPeriod: 'annual' | 'monthly' | 'hourly';
  isNegotiable: boolean;
  notes?: string;
}

export interface IndiaRecruitmentPack {
  enabled: boolean;
  tenthPercentage?: number;
  tenthPassingYear?: string;
  tenthBoard?: string;
  twelfthPercentage?: number;
  twelfthPassingYear?: string;
  twelfthBoard?: string;
  twelfthStream?: string;
  diplomaPercentage?: number;
  diplomaPassingYear?: string;
  undergradCgpa?: number;
  undergradPercentage?: number;
  cgpaConversionFormula?: string;
  activeBacklogsCount?: number;
  clearedBacklogsCount?: number;
  historyOfArrears?: boolean;
  educationGapYears?: number;
  educationGapReason?: string;
  studentRegistrationNumber?: string;
  universityRollNumber?: string;
  collegeIdNumber?: string;
  currentCtcLpa?: number; // CTC in Lakhs Per Annum
  expectedCtcLpa?: number;
  noticePeriodDays?: number;
  willingToSignBond?: boolean;
  bondDurationMonths?: number;
  dayScholarOrHosteller?: 'day_scholar' | 'hosteller';
  aadhaarNumberMasked?: string; // Restricted sensitive identifier
  panNumberMasked?: string;     // Restricted sensitive identifier
  firstGenerationGraduate?: boolean;
}

export type CountryPacksData = Record<string, Record<string, any>>;
export * from './country-packs';

export interface QuestionBankItem {
  id: string;
  question: string;
  aliases: string[];
  answer: string;
  category: 'narrative' | 'screening' | 'eligibility' | 'behavioral' | 'other';
  isVerified: boolean;
  companyScoped: boolean;
  company?: string;
  lastUpdated: number;
}

export interface DocumentMetadata {
  id: string;
  documentType:
    | 'resume'
    | 'cover_letter'
    | 'transcript'
    | 'class_10_marksheet'
    | 'class_12_marksheet'
    | 'degree_certificate'
    | 'provisional_certificate'
    | 'experience_letter'
    | 'relieving_letter'
    | 'payslip'
    | 'id_proof'
    | 'passport'
    | 'other';
  filename: string;
  issuingAuthority?: string;
  issueDate?: string;
  expiryDate?: string;
  isAvailableLocally: boolean;
  notes?: string;
}

export interface BackgroundCompliance {
  educationVerificationConsent: boolean;
  employmentVerificationConsent: boolean;
  referenceCheckConsent: boolean;
  backgroundCheckConsent: boolean;
  criminalRecordDeclared: boolean;
  criminalRecordDetails?: string;
  hasNonCompete: boolean;
  nonCompeteDetails?: string;
  hasBondObligation: boolean;
  bondDetails?: string;
  conflictOfInterestDeclared: boolean;
  conflictOfInterestDetails?: string;
  accurateDeclaration: boolean;
}

export interface LanguageProficiency {
  language: string;
  speaking: 'basic' | 'intermediate' | 'fluent' | 'native';
  reading: 'basic' | 'intermediate' | 'fluent' | 'native';
  writing: 'basic' | 'intermediate' | 'fluent' | 'native';
  isPrimary?: boolean;
}

export interface ExperienceOverrides {
  isOverridden: boolean;
  totalExperienceYears?: number;
  totalExperienceMonths?: number;
  displayTotalExperience?: string;
  fullTimeYears?: number;
  currentEmployerTenureYears?: number;
  totalEmployersCount?: number;
}

export interface DerivedExperienceSummary {
  totalExperienceMonths: number;
  totalExperienceYears: number;
  displayTotalExperience: string; // e.g. "3.5 years" or "3 years 6 months"
  fullTimeYears: number;
  partTimeYears: number;
  internshipMonths: number;
  currentEmployerTenureYears: number;
  totalEmployersCount: number;
  hasEmploymentGaps: boolean;
  gapsSummary?: string;
  isOverridden?: boolean;
}

// ── Derived Experience Calculator ──────────────────────────────────────────

/**
 * Calculates total experience, tenure, and gap summaries from employment records.
 * Supports manual user overrides (e.g. for freshers with only internships).
 */
export function calculateDerivedExperience(
  records: Array<{
    startDate: string;
    endDate?: string;
    currentlyEmployed?: boolean;
    employmentType?: string;
    company?: string;
    employerName?: string;
    jobTitle?: string;
    title?: string;
    countsTowardsExperience?: boolean;
    isInternship?: boolean;
  }>,
  overrides?: ExperienceOverrides
): DerivedExperienceSummary {
  // If user provided an active override, honor it directly
  if (overrides && overrides.isOverridden) {
    const totalY = Math.max(0, overrides.totalExperienceYears ?? 0);
    const totalM = overrides.totalExperienceMonths ?? Math.round(totalY * 12);
    const yearsComponent = Math.floor(totalM / 12);
    const remainingMonths = totalM % 12;
    const displayTotalExperience =
      overrides.displayTotalExperience ||
      (totalY === 0
        ? '0 years (Fresher)'
        : yearsComponent > 0 && remainingMonths > 0
        ? `${yearsComponent} yr ${remainingMonths} mo`
        : yearsComponent > 0
        ? `${yearsComponent} yr${yearsComponent > 1 ? 's' : ''}`
        : `${remainingMonths} mo${remainingMonths > 1 ? 's' : ''}`);

    return {
      totalExperienceMonths: totalM,
      totalExperienceYears: totalY,
      displayTotalExperience,
      fullTimeYears: Math.max(0, overrides.fullTimeYears ?? 0),
      partTimeYears: 0,
      internshipMonths: 0,
      currentEmployerTenureYears: Math.max(0, overrides.currentEmployerTenureYears ?? 0),
      totalEmployersCount: Math.max(0, overrides.totalEmployersCount ?? 0),
      hasEmploymentGaps: false,
      isOverridden: true,
    };
  }

  if (!records || records.length === 0) {
    return {
      totalExperienceMonths: 0,
      totalExperienceYears: 0,
      displayTotalExperience: '0 years',
      fullTimeYears: 0,
      partTimeYears: 0,
      internshipMonths: 0,
      currentEmployerTenureYears: 0,
      totalEmployersCount: 0,
      hasEmploymentGaps: false,
      isOverridden: false,
    };
  }

  const now = new Date();
  let totalMonths = 0;
  let fullTimeMonths = 0;
  let partTimeMonths = 0;
  let internshipMonths = 0;
  let currentTenureMonths = 0;

  const validIntervals: Array<{ start: Date; end: Date; type: string; current: boolean; countsTowardsExperience: boolean }> = [];

  for (const r of records) {
    if (!r.startDate) continue;
    const start = new Date(r.startDate);
    if (isNaN(start.getTime())) continue;

    let end = now;
    const isCurrent = Boolean(r.currentlyEmployed || !r.endDate || r.endDate.toLowerCase() === 'present');
    if (!isCurrent && r.endDate) {
      const parsedEnd = new Date(r.endDate);
      if (!isNaN(parsedEnd.getTime())) {
        end = parsedEnd;
      }
    }

    if (end < start) continue;

    const diffMonths = Math.max(
      0,
      (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth())
    );

    const type = r.employmentType || 'full_time';
    const isIntern = type === 'internship' || Boolean(r.isInternship);
    const titleLower = String(r.jobTitle || (r as any).title || '').toLowerCase();
    const isInternTitle = titleLower.includes('intern') || titleLower.includes('trainee');
    const isOpenSource = type === 'open_source' || titleLower.includes('open source') || titleLower.includes('maintainer');

    // If countsTowardsExperience is explicitly false, it definitely does not count toward work exp
    const counts = r.countsTowardsExperience !== false;

    if (isIntern || isInternTitle) {
      internshipMonths += diffMonths;
      // In default calculation, internships do not add to total professional work experience months unless explicitly flagged
      if (r.countsTowardsExperience === true) {
        totalMonths += diffMonths;
      }
    } else if (isOpenSource) {
      if (counts && r.countsTowardsExperience === true) {
        totalMonths += diffMonths;
      }
    } else if (type === 'part_time') {
      partTimeMonths += diffMonths;
      if (counts) {
        totalMonths += Math.round(diffMonths * 0.5);
      }
    } else {
      if (counts) {
        fullTimeMonths += diffMonths;
        totalMonths += diffMonths;
      }
    }

    if (isCurrent && counts) {
      currentTenureMonths = Math.max(currentTenureMonths, diffMonths);
    }

    validIntervals.push({ start, end, type, current: isCurrent, countsTowardsExperience: counts });
  }

  const totalYears = Math.round((totalMonths / 12) * 10) / 10;
  const ftYears = Math.round((fullTimeMonths / 12) * 10) / 10;
  const ptYears = Math.round((partTimeMonths / 12) * 10) / 10;
  const tenureYears = Math.round((currentTenureMonths / 12) * 10) / 10;

  const yearsComponent = Math.floor(totalMonths / 12);
  const remainingMonths = totalMonths % 12;
  const displayTotalExperience =
    yearsComponent === 0 && remainingMonths === 0
      ? '0 years'
      : yearsComponent > 0 && remainingMonths > 0
      ? `${yearsComponent} yr ${remainingMonths} mo`
      : yearsComponent > 0
      ? `${yearsComponent} yr${yearsComponent > 1 ? 's' : ''}`
      : `${remainingMonths} mo${remainingMonths > 1 ? 's' : ''}`;

  // Count employers: exclude roles where countsTowardsExperience is explicitly false
  const qualifyingEmployers = validIntervals.filter(i => i.countsTowardsExperience);

  return {
    totalExperienceMonths: totalMonths,
    totalExperienceYears: totalYears,
    displayTotalExperience,
    fullTimeYears: ftYears,
    partTimeYears: ptYears,
    internshipMonths,
    currentEmployerTenureYears: tenureYears,
    totalEmployersCount: qualifyingEmployers.length,
    hasEmploymentGaps: false,
    isOverridden: false,
  };
}

// ── Default Initializers ───────────────────────────────────────────────────

export function createDefaultIndiaPack(): IndiaRecruitmentPack {
  return {
    enabled: false,
    willingToSignBond: false,
    historyOfArrears: false,
    activeBacklogsCount: 0,
    clearedBacklogsCount: 0,
    dayScholarOrHosteller: 'day_scholar',
  };
}

export function createDefaultCompliance(): BackgroundCompliance {
  return {
    educationVerificationConsent: true,
    employmentVerificationConsent: true,
    referenceCheckConsent: true,
    backgroundCheckConsent: true,
    criminalRecordDeclared: false,
    hasNonCompete: false,
    hasBondObligation: false,
    conflictOfInterestDeclared: false,
    accurateDeclaration: true,
  };
}

export function createDefaultCustomField(
  key: string,
  label: string,
  sectionId: CustomFieldDefinition['sectionId'],
  dataType: CustomFieldValueType = 'text',
  aliases: string[] = []
): CustomFieldDefinition {
  return {
    id: `cf_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    key,
    label,
    sectionId,
    dataType,
    aliases,
    sensitivity: 'ordinary',
    aiAccessPermitted: true,
    autoFillPermitted: true,
    requiresConfirmation: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export interface WorkPreferences {
  workplaceTypes: Array<'remote' | 'hybrid' | 'onsite' | 'flexible'>;
  preferredLocations: string[]; // Any number of preferred cities/regions e.g. ["Remote", "San Francisco", "Austin", "London"]
  willingToRelocate: boolean | 'negotiable' | 'with_assistance';
  relocationAssistanceRequired?: boolean;
  willingToTravel: boolean;
  travelPercentage?: number; // e.g. 0, 25, 50, 75, 100
  employmentTypes?: Array<'full_time' | 'part_time' | 'contract_w2' | 'contract_1099' | 'c2c' | 'internship' | 'freelance'>;
  shiftPreferences?: Array<'day' | 'night' | 'weekend' | 'rotating' | 'flexible'>;
  overtimeWilling?: boolean;
  targetRoleTitles?: string[];
  targetIndustries?: string[];
  preferredTimezones?: string[];
  noticePeriodDays?: number;
  earliestStartDays?: number; // Days until candidate can join: 0 for immediate, 7 for 1 week, 30 for 1 month
  earliestStartDate?: string;
  minimumAcceptableSalary?: number;
  targetSalary?: number;
  salaryCurrency?: string;
  salaryPeriod?: 'annual' | 'monthly' | 'hourly';
  notes?: string;
}

export interface LegalAndDisclosures {
  over18: boolean;
  legallyAuthorized: boolean;
  requiresSponsorship: boolean;
  sponsorshipTimeline?: string; // "Immediate", "Within 6 months", "Not in foreseeable future"
  visaStatus?: string; // "US Citizen", "US Permanent Resident", "H-1B", "F-1 STEM OPT", "TN", "Canadian Citizen", "UK Right to Work", "EU Blue Card", etc.
  optStemEligible?: boolean;
  optMonthsRemaining?: number;
  securityClearance?: 'none' | 'confidential' | 'secret' | 'top_secret' | 'ts_sci' | 'polygraph' | 'public_trust';
  itarCompliant?: boolean; // U.S. Person under ITAR/EAR regulations
  hasValidDriverLicense?: boolean;
  driverLicenseState?: string;
  hasCleanDrivingRecord?: boolean;
  previouslyEmployedAtCompany?: boolean;
  previousEmploymentDetails?: string;
  hasRelativesAtCompany?: boolean;
  relativesDetails?: string;
  hasNonCompeteOrRestrictions?: boolean;
  nonCompeteDetails?: string;
  backgroundCheckConsent?: boolean;
  drugScreeningConsent?: boolean;
  referralSource?: string; // "LinkedIn", "Indeed", "Company Career Site", "Employee Referral", "GitHub", "Other"
  referrerName?: string;
  referrerEmail?: string;
}

export function createDefaultWorkPreferences(): WorkPreferences {
  return {
    workplaceTypes: ['remote', 'hybrid'],
    preferredLocations: ['Remote'],
    willingToRelocate: false,
    relocationAssistanceRequired: false,
    willingToTravel: false,
    travelPercentage: 0,
    employmentTypes: ['full_time'],
    shiftPreferences: ['day', 'flexible'],
    overtimeWilling: false,
    targetRoleTitles: [],
    targetIndustries: [],
    preferredTimezones: [],
    noticePeriodDays: 14,
    salaryCurrency: 'USD',
    salaryPeriod: 'annual',
  };
}

export function createDefaultLegalAndDisclosures(): LegalAndDisclosures {
  return {
    over18: true,
    legallyAuthorized: true,
    requiresSponsorship: false,
    visaStatus: 'US Citizen / Permanent Resident',
    securityClearance: 'none',
    itarCompliant: true,
    hasValidDriverLicense: true,
    hasCleanDrivingRecord: true,
    previouslyEmployedAtCompany: false,
    hasRelativesAtCompany: false,
    hasNonCompeteOrRestrictions: false,
    backgroundCheckConsent: true,
    drugScreeningConsent: true,
    referralSource: 'LinkedIn',
  };
}

export function createDefaultQuestionBank(): QuestionBankItem[] {
  return [
    {
      id: 'qb_why_company',
      question: 'Why do you want to work here?',
      aliases: ['why this company', 'why us', 'why work with us', 'what interests you about this role', 'why do you want to join', 'what attracted you to this position'],
      answer: 'I am drawn to your mission of building impactful products with high technical excellence. My background directly aligns with the challenges your engineering team is solving, and I value your collaborative, high-ownership engineering culture.',
      category: 'narrative',
      isVerified: true,
      companyScoped: false,
      lastUpdated: Date.now(),
    },
    {
      id: 'qb_challenging_project',
      question: 'Describe a challenging technical project you worked on and how you resolved obstacles.',
      aliases: ['challenging project', 'tell us about a project', 'complex technical problem', 'proudest project', 'difficult engineering challenge'],
      answer: 'In my recent role, I led the architecture and refactoring of a core distributed data pipeline that suffered from performance bottlenecks during peak loads. I profiled memory and I/O bottlenecks, introduced asynchronous streaming processing, and added automated test coverage, reducing latency by 45% while maintaining zero downtime.',
      category: 'narrative',
      isVerified: true,
      companyScoped: false,
      lastUpdated: Date.now(),
    },
    {
      id: 'qb_greatest_strength',
      question: 'What are your greatest professional strengths?',
      aliases: ['key strengths', 'biggest strength', 'what are you best at', 'core competencies', 'what sets you apart'],
      answer: 'My greatest strengths are rapid technical problem solving, clean system architecture, and clear cross-functional communication. I bridge complex technical requirements into reliable, maintainable software while keeping customer experience front and center.',
      category: 'narrative',
      isVerified: true,
      companyScoped: false,
      lastUpdated: Date.now(),
    },
    {
      id: 'qb_remote_experience',
      question: 'Describe your experience working in distributed or remote teams.',
      aliases: ['remote work experience', 'distributed team', 'how do you handle remote work', 'asynchronous communication', 'working from home'],
      answer: 'I have extensive experience working asynchronously in high-velocity distributed teams across multiple time zones. I rely on clear written documentation, proactive communication, reliable task tracking, and structured self-management to drive projects to completion.',
      category: 'screening',
      isVerified: true,
      companyScoped: false,
      lastUpdated: Date.now(),
    },
    {
      id: 'qb_disagreement',
      question: 'Tell us about a time you had a technical disagreement with a colleague and how you resolved it.',
      aliases: ['technical disagreement', 'conflict resolution', 'disagree and commit', 'how do you handle disagreement'],
      answer: 'When debating database architectures for a new feature, a colleague favored a document store while I advocated for a relational schema. Rather than debating theoretically, we defined specific read/write throughput criteria and ran a focused benchmark. The benchmark validated their document-store approach for our specific queries, so I gladly supported it and led the implementation.',
      category: 'behavioral',
      isVerified: true,
      companyScoped: false,
      lastUpdated: Date.now(),
    },
    {
      id: 'qb_unusual_belief',
      question: 'What is something you believe that most people disagree with?',
      aliases: ['contrarian view', 'what do you believe that others do not', 'unconventional opinion', 'hot take'],
      answer: 'In software development, I believe removing unnecessary features and deleting code usually produces far more value, security, and velocity than adding new abstractions.',
      category: 'behavioral',
      isVerified: true,
      companyScoped: false,
      lastUpdated: Date.now(),
    },
    {
      id: 'qb_heard_about',
      question: 'How did you hear about this position?',
      aliases: ['how did you find us', 'referral source', 'where did you hear about this role', 'how did you hear about this job', 'source of application'],
      answer: 'LinkedIn Jobs',
      category: 'screening',
      isVerified: true,
      companyScoped: false,
      lastUpdated: Date.now(),
    },
    {
      id: 'qb_looking_for',
      question: 'What are you looking for in your next role?',
      aliases: ['what are you looking for', 'ideal next role', 'career goals', 'what do you want in your next position'],
      answer: 'I am looking for a high-impact engineering role where I can tackle complex technical systems, collaborate with thoughtful teammates, and deliver software that makes a tangible difference for users.',
      category: 'narrative',
      isVerified: true,
      companyScoped: false,
      lastUpdated: Date.now(),
    },
  ];
}

