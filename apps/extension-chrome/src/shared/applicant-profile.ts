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
  employmentType: 'full_time' | 'part_time' | 'contract' | 'internship' | 'freelance' | 'temporary';
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
}

// ── Derived Experience Calculator ──────────────────────────────────────────

/**
 * Calculates total experience, tenure, and gap summaries from employment records.
 */
export function calculateDerivedExperience(
  records: Array<{
    startDate: string;
    endDate?: string;
    currentlyEmployed?: boolean;
    employmentType?: string;
    company?: string;
    employerName?: string;
  }>
): DerivedExperienceSummary {
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
    };
  }

  const now = new Date();
  let totalMonths = 0;
  let fullTimeMonths = 0;
  let partTimeMonths = 0;
  let internshipMonths = 0;
  let currentTenureMonths = 0;

  const validIntervals: Array<{ start: Date; end: Date; type: string; current: boolean }> = [];

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
    if (type === 'internship') {
      internshipMonths += diffMonths;
    } else if (type === 'part_time') {
      partTimeMonths += diffMonths;
      totalMonths += Math.round(diffMonths * 0.5);
    } else {
      fullTimeMonths += diffMonths;
      totalMonths += diffMonths;
    }

    if (isCurrent) {
      currentTenureMonths = Math.max(currentTenureMonths, diffMonths);
    }

    validIntervals.push({ start, end, type, current: isCurrent });
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

  return {
    totalExperienceMonths: totalMonths,
    totalExperienceYears: totalYears,
    displayTotalExperience,
    fullTimeYears: ftYears,
    partTimeYears: ptYears,
    internshipMonths,
    currentEmployerTenureYears: tenureYears,
    totalEmployersCount: validIntervals.length,
    hasEmploymentGaps: false,
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
