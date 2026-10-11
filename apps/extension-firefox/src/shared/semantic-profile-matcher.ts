/**
 * Semantic Profile Matcher
 *
 * Implements the 4-stage profile matching engine:
 * 1. Understand the question (extract meaning, entity, units, context)
 * 2. Retrieve candidate values (canonical, repeatable, derived, India pack, custom fields, question bank)
 * 3. Validate the match (units, freshness, entity disambiguation, type compatibility)
 * 4. Fill, ask, or abstain (with privacy & sensitivity classification)
 */

import type { FieldSchema } from './types';
import type { UserProfile } from './profile';
import {
  formatPhone,
  formatLocation,
  calculateDerivedExperience,
  type SensitivityLevel,
  type CustomFieldDefinition,
  type QuestionBankItem,
  type FamilyContact,
} from './applicant-profile';

export interface SemanticMatchResult {
  value: string | number | boolean | null;
  confidence: number;
  source:
    | 'canonical_personal'
    | 'canonical_professional'
    | 'family_contact'
    | 'education_history'
    | 'india_pack'
    | 'employment_derived'
    | 'compensation'
    | 'reference'
    | 'custom_field'
    | 'question_bank'
    | 'work_preferences'
    | 'legal_disclosures';
  fieldKey: string;
  fieldLabel: string;
  entity?: string; // e.g. "father", "mother", "applicant", "school"
  sensitivity: SensitivityLevel;
  requiresConfirmation: boolean;
  aiAccessPermitted: boolean;
  selectionReason: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalizeText(text: string): string {
  return (text || '').toLowerCase().trim();
}

function matchesAny(text: string, patterns: Array<string | RegExp>): boolean {
  const norm = normalizeText(text);
  return patterns.some(p => (typeof p === 'string' ? norm.includes(p.toLowerCase()) : p.test(norm)));
}

// ── Matcher Implementation ───────────────────────────────────────────────────

export class SemanticProfileMatcher {
  /**
   * Find the best match for a form field from the rich user profile.
   */
  match(field: FieldSchema, profile: UserProfile): SemanticMatchResult | null {
    if (!profile) return null;

    const label = field.label || '';
    const name = field.name || '';
    const id = field.id || '';
    const combined = `${label} ${name} ${id}`.toLowerCase().trim();

    // ── 1. CUSTOM FIELDS (User-defined fields take high priority for exact custom keys) ──
    if (profile.customFields && profile.customFields.length > 0) {
      for (const cf of profile.customFields) {
        if (cf.value === undefined || cf.value === null || String(cf.value).trim() === '') continue;

        const keyMatch = matchesAny(combined, [cf.key, cf.label]);
        const aliasMatch = cf.aliases && cf.aliases.length > 0 && matchesAny(combined, cf.aliases);

        if (keyMatch || aliasMatch) {
          return {
            value: cf.value,
            confidence: keyMatch ? 0.95 : 0.9,
            source: 'custom_field',
            fieldKey: cf.key,
            fieldLabel: cf.label,
            sensitivity: cf.sensitivity || 'ordinary',
            requiresConfirmation: cf.requiresConfirmation || cf.sensitivity === 'restricted_identifier',
            aiAccessPermitted: cf.aiAccessPermitted !== false && cf.sensitivity !== 'restricted_identifier',
            selectionReason: `Matched custom field "${cf.label}" via ${keyMatch ? 'key/label' : 'alias'}`,
          };
        }
      }
    }

    // ── 2. FAMILY / GUARDIAN / EMERGENCY CONTACTS ──────────────────────────────
    // Distinguish Father vs Mother vs Guardian vs Emergency Contact vs Applicant
    const isFather = matchesAny(combined, [/\bfather\b/, /\bdad\b/, /\bfather's\b/]);
    const isMother = matchesAny(combined, [/\bmother\b/, /\bmom\b/, /\bmother's\b/]);
    const isGuardian = matchesAny(combined, [/\bguardian\b/, /\bguardian's\b/]);
    const isEmergency = matchesAny(combined, [/\bemergency\b/, /\bnext of kin\b/]);

    if (isFather || isMother || isGuardian || isEmergency) {
      const relType = isFather
        ? 'father'
        : isMother
        ? 'mother'
        : isGuardian
        ? 'guardian'
        : 'emergency';

      const contact = profile.familyContacts?.find(c =>
        relType === 'emergency' ? c.isEmergencyContact || c.relationship === 'emergency' : c.relationship === relType
      );

      if (contact) {
        // Contact phone
        if (matchesAny(combined, ['phone', 'mobile', 'tel', 'cell', 'contact number'])) {
          return {
            value: contact.phone,
            confidence: 0.94,
            source: 'family_contact',
            fieldKey: `${relType}_phone`,
            fieldLabel: `${relType.charAt(0).toUpperCase() + relType.slice(1)}'s Phone`,
            entity: relType,
            sensitivity: 'sensitive_personal',
            requiresConfirmation: false,
            aiAccessPermitted: true,
            selectionReason: `Resolved ${relType}'s phone number from family contacts`,
          };
        }

        // Contact occupation / designation / profession
        if (matchesAny(combined, ['occupation', 'profession', 'job', 'designation', 'work'])) {
          if (contact.occupation) {
            return {
              value: contact.occupation,
              confidence: 0.95,
              source: 'family_contact',
              fieldKey: `${relType}_occupation`,
              fieldLabel: `${relType.charAt(0).toUpperCase() + relType.slice(1)}'s Occupation`,
              entity: relType,
              sensitivity: 'ordinary',
              requiresConfirmation: false,
              aiAccessPermitted: true,
              selectionReason: `Resolved ${relType}'s occupation from family contacts`,
            };
          }
        }

        // Contact employer / company
        if (matchesAny(combined, ['employer', 'company', 'organization'])) {
          if (contact.employer) {
            return {
              value: contact.employer,
              confidence: 0.92,
              source: 'family_contact',
              fieldKey: `${relType}_employer`,
              fieldLabel: `${relType.charAt(0).toUpperCase() + relType.slice(1)}'s Employer`,
              entity: relType,
              sensitivity: 'ordinary',
              requiresConfirmation: false,
              aiAccessPermitted: true,
              selectionReason: `Resolved ${relType}'s employer from family contacts`,
            };
          }
        }

        // Contact email
        if (matchesAny(combined, ['email', 'mail']) && contact.email) {
          return {
            value: contact.email,
            confidence: 0.93,
            source: 'family_contact',
            fieldKey: `${relType}_email`,
            fieldLabel: `${relType.charAt(0).toUpperCase() + relType.slice(1)}'s Email`,
            entity: relType,
            sensitivity: 'sensitive_personal',
            requiresConfirmation: false,
            aiAccessPermitted: true,
            selectionReason: `Resolved ${relType}'s email from family contacts`,
          };
        }

        // Contact name
        if (matchesAny(combined, ['name', 'full name']) && contact.name) {
          return {
            value: contact.name,
            confidence: 0.95,
            source: 'family_contact',
            fieldKey: `${relType}_name`,
            fieldLabel: `${relType.charAt(0).toUpperCase() + relType.slice(1)}'s Name`,
            entity: relType,
            sensitivity: 'sensitive_personal',
            requiresConfirmation: false,
            aiAccessPermitted: true,
            selectionReason: `Resolved ${relType}'s full name from family contacts`,
          };
        }
      }
    }

    // ── 3. ALTERNATE PHONE VS PRIMARY PHONE ────────────────────────────────────
    const isAlternatePhone = matchesAny(combined, [
      'alternate phone',
      'alternative phone',
      'alternate contact',
      'secondary phone',
      'backup phone',
      'alternate mobile',
      'secondary contact',
      'other phone',
    ]);

    if (isAlternatePhone) {
      const alt = profile.personal.alternatePhone;
      if (alt) {
        const val = typeof alt === 'string' ? alt : formatPhone(alt);
        return {
          value: val,
          confidence: 0.96,
          source: 'canonical_personal',
          fieldKey: 'alternate_phone',
          fieldLabel: 'Alternate Phone',
          sensitivity: 'ordinary',
          requiresConfirmation: false,
          aiAccessPermitted: true,
          selectionReason: 'Mapped to dedicated alternate contact number',
        };
      }
    }

    // ── 4. INDIA RECRUITMENT PACK & DETAILED EDUCATION SCORES ──────────────────
    const pack = profile.indiaPack;
    const eduHistory = profile.educationHistory || [];

    // Class 10 / Secondary School
    const isClass10 = matchesAny(combined, [
      /\b10th\b/,
      /\btenth\b/,
      /\bclass 10\b/,
      /\bclass x\b/,
      /\bmatriculation\b/,
      /\bssc\b/,
      /\bsecondary school\b/,
      /\bsecondary examination\b/,
    ]);

    if (isClass10) {
      const rec10 = eduHistory.find(e => e.level === 'class_10');

      // Percentage or score
      if (matchesAny(combined, ['percentage', 'percent', 'marks', 'score', 'aggregate', 'grade', 'cgpa', 'result'])) {
        const val = pack?.tenthPercentage ?? rec10?.scoreValue;
        if (val !== undefined && val !== null) {
          return {
            value: val,
            confidence: 0.95,
            source: pack?.tenthPercentage ? 'india_pack' : 'education_history',
            fieldKey: 'class_10_percentage',
            fieldLabel: 'Class 10 Percentage',
            sensitivity: 'ordinary',
            requiresConfirmation: false,
            aiAccessPermitted: true,
            selectionReason: 'Resolved 10th grade aggregate/percentage',
          };
        }
      }

      // Year of passing
      if (matchesAny(combined, ['year', 'passing year', 'completion', 'graduat'])) {
        const val = pack?.tenthPassingYear ?? rec10?.yearOfPassing ?? rec10?.endYear;
        if (val) {
          return {
            value: val,
            confidence: 0.95,
            source: pack?.tenthPassingYear ? 'india_pack' : 'education_history',
            fieldKey: 'class_10_passing_year',
            fieldLabel: 'Class 10 Passing Year',
            sensitivity: 'ordinary',
            requiresConfirmation: false,
            aiAccessPermitted: true,
            selectionReason: 'Resolved 10th grade passing year',
          };
        }
      }

      // Board
      if (matchesAny(combined, ['board', 'authority', 'council'])) {
        const val = pack?.tenthBoard ?? rec10?.boardOrUniversity;
        if (val) {
          return {
            value: val,
            confidence: 0.94,
            source: 'india_pack',
            fieldKey: 'class_10_board',
            fieldLabel: 'Class 10 Board',
            sensitivity: 'ordinary',
            requiresConfirmation: false,
            aiAccessPermitted: true,
            selectionReason: 'Resolved 10th grade education board',
          };
        }
      }

      // School name
      if (matchesAny(combined, ['school', 'institution', 'college']) && rec10?.schoolOrInstitution) {
        return {
          value: rec10.schoolOrInstitution,
          confidence: 0.92,
          source: 'education_history',
          fieldKey: 'class_10_school',
          fieldLabel: 'Class 10 School Name',
          sensitivity: 'ordinary',
          requiresConfirmation: false,
          aiAccessPermitted: true,
          selectionReason: 'Resolved 10th grade school name',
        };
      }
    }

    // Class 12 / Higher Secondary
    const isClass12 = matchesAny(combined, [
      /\b12th\b/,
      /\btwelfth\b/,
      /\bclass 12\b/,
      /\bclass xii\b/,
      /\bhsc\b/,
      /\bintermediate\b/,
      /\bhigher secondary\b/,
      /\bsenior secondary\b/,
      /\bplus two\b/,
      /\b\+2\b/,
    ]);

    if (isClass12) {
      const rec12 = eduHistory.find(e => e.level === 'class_12');

      // Percentage / score
      if (matchesAny(combined, ['percentage', 'percent', 'marks', 'score', 'aggregate', 'grade', 'cgpa', 'result'])) {
        const val = pack?.twelfthPercentage ?? rec12?.scoreValue;
        if (val !== undefined && val !== null) {
          return {
            value: val,
            confidence: 0.95,
            source: pack?.twelfthPercentage ? 'india_pack' : 'education_history',
            fieldKey: 'class_12_percentage',
            fieldLabel: 'Class 12 Percentage',
            sensitivity: 'ordinary',
            requiresConfirmation: false,
            aiAccessPermitted: true,
            selectionReason: 'Resolved 12th grade aggregate/percentage',
          };
        }
      }

      // Passing year
      if (matchesAny(combined, ['year', 'passing year', 'completion', 'graduat'])) {
        const val = pack?.twelfthPassingYear ?? rec12?.yearOfPassing ?? rec12?.endYear;
        if (val) {
          return {
            value: val,
            confidence: 0.95,
            source: pack?.twelfthPassingYear ? 'india_pack' : 'education_history',
            fieldKey: 'class_12_passing_year',
            fieldLabel: 'Class 12 Passing Year',
            sensitivity: 'ordinary',
            requiresConfirmation: false,
            aiAccessPermitted: true,
            selectionReason: 'Resolved 12th grade passing year',
          };
        }
      }

      // Board
      if (matchesAny(combined, ['board', 'authority'])) {
        const val = pack?.twelfthBoard ?? rec12?.boardOrUniversity;
        if (val) {
          return {
            value: val,
            confidence: 0.94,
            source: 'india_pack',
            fieldKey: 'class_12_board',
            fieldLabel: 'Class 12 Board',
            sensitivity: 'ordinary',
            requiresConfirmation: false,
            aiAccessPermitted: true,
            selectionReason: 'Resolved 12th grade education board',
          };
        }
      }

      // Stream
      if (matchesAny(combined, ['stream', 'branch']) && (pack?.twelfthStream || rec12?.streamOrMajor)) {
        return {
          value: (pack?.twelfthStream || rec12?.streamOrMajor)!,
          confidence: 0.93,
          source: 'india_pack',
          fieldKey: 'class_12_stream',
          fieldLabel: 'Class 12 Stream',
          sensitivity: 'ordinary',
          requiresConfirmation: false,
          aiAccessPermitted: true,
          selectionReason: 'Resolved 12th grade academic stream',
        };
      }
    }

    // Student ID / University Roll Number / Registration Number
    if (matchesAny(combined, ['student id', 'student roll', 'registration number', 'reg no', 'roll number', 'roll no', 'college id', 'university roll', 'usn'])) {
      const val =
        pack?.studentRegistrationNumber ||
        pack?.universityRollNumber ||
        pack?.collegeIdNumber ||
        eduHistory.find(e => e.studentIdOrRollNo)?.studentIdOrRollNo ||
        eduHistory.find(e => e.registrationNumber)?.registrationNumber;

      if (val) {
        return {
          value: val,
          confidence: 0.92,
          source: 'india_pack',
          fieldKey: 'student_id_or_roll_no',
          fieldLabel: 'Student ID / Roll Number',
          sensitivity: 'ordinary',
          requiresConfirmation: false,
          aiAccessPermitted: true,
          selectionReason: 'Resolved student ID / registration / roll number',
        };
      }
    }

    // Arrears / Backlogs
    if (matchesAny(combined, ['backlog', 'backlogs', 'arrear', 'arrears'])) {
      if (matchesAny(combined, ['active', 'current', 'standing'])) {
        const count = pack?.activeBacklogsCount ?? 0;
        return {
          value: count,
          confidence: 0.94,
          source: 'india_pack',
          fieldKey: 'active_backlogs',
          fieldLabel: 'Active Backlogs',
          sensitivity: 'ordinary',
          requiresConfirmation: false,
          aiAccessPermitted: true,
          selectionReason: 'Resolved active arrears / backlogs count',
        };
      }
      if (matchesAny(combined, ['history', 'cleared', 'total', 'past'])) {
        const count = pack?.clearedBacklogsCount ?? (pack?.historyOfArrears ? 1 : 0);
        return {
          value: count,
          confidence: 0.92,
          source: 'india_pack',
          fieldKey: 'historical_backlogs',
          fieldLabel: 'Historical Backlogs',
          sensitivity: 'ordinary',
          requiresConfirmation: false,
          aiAccessPermitted: true,
          selectionReason: 'Resolved historical/cleared arrears count',
        };
      }
      // General backlogs query
      return {
        value: pack?.activeBacklogsCount ?? 0,
        confidence: 0.9,
        source: 'india_pack',
        fieldKey: 'backlogs',
        fieldLabel: 'Backlogs',
        sensitivity: 'ordinary',
        requiresConfirmation: false,
        aiAccessPermitted: true,
        selectionReason: 'Resolved backlogs count',
      };
    }

    // Academic Gaps
    if (matchesAny(combined, ['gap in education', 'academic gap', 'education gap', 'year gap', 'gap between'])) {
      if (matchesAny(combined, ['reason', 'explanation', 'why']) && pack?.educationGapReason) {
        return {
          value: pack.educationGapReason,
          confidence: 0.9,
          source: 'india_pack',
          fieldKey: 'education_gap_reason',
          fieldLabel: 'Education Gap Reason',
          sensitivity: 'ordinary',
          requiresConfirmation: false,
          aiAccessPermitted: true,
          selectionReason: 'Resolved education gap explanation',
        };
      }
      const gapYears = pack?.educationGapYears ?? 0;
      return {
        value: gapYears,
        confidence: 0.92,
        source: 'india_pack',
        fieldKey: 'education_gap_years',
        fieldLabel: 'Education Gap (Years)',
        sensitivity: 'ordinary',
        requiresConfirmation: false,
        aiAccessPermitted: true,
        selectionReason: 'Resolved education gap duration in years',
      };
    }

    // Service Agreement / Employment Bond
    if (matchesAny(combined, ['service agreement', 'employment bond', 'service bond', 'bond agreement', 'sign a bond'])) {
      const willing = pack?.willingToSignBond ?? false;
      const val = field.type === 'checkbox' ? willing : willing ? 'Yes' : 'No';
      return {
        value: val,
        confidence: 0.94,
        source: 'india_pack',
        fieldKey: 'service_bond_willingness',
        fieldLabel: 'Service Bond Willingness',
        sensitivity: 'ordinary',
        requiresConfirmation: false,
        aiAccessPermitted: true,
        selectionReason: 'Resolved willingness to sign employment bond/service agreement',
      };
    }

    // ── 5. COMPENSATION & SALARY DETAILS ───────────────────────────────────────
    const comp = profile.compensation;

    // Current CTC / Salary
    if (matchesAny(combined, ['current ctc', 'current annual ctc', 'current salary', 'current gross', 'current pay', 'present ctc'])) {
      if (pack?.currentCtcLpa && matchesAny(combined, ['lpa', 'lakhs', 'inr'])) {
        return {
          value: pack.currentCtcLpa,
          confidence: 0.95,
          source: 'india_pack',
          fieldKey: 'current_ctc_lpa',
          fieldLabel: 'Current CTC (LPA)',
          sensitivity: 'ordinary',
          requiresConfirmation: false,
          aiAccessPermitted: true,
          selectionReason: 'Resolved current CTC in Lakhs Per Annum',
        };
      }
      if (comp?.currentAnnualCtc) {
        return {
          value: comp.currentAnnualCtc,
          confidence: 0.93,
          source: 'compensation',
          fieldKey: 'current_annual_ctc',
          fieldLabel: 'Current Annual CTC',
          sensitivity: 'ordinary',
          requiresConfirmation: false,
          aiAccessPermitted: true,
          selectionReason: 'Resolved current annual compensation',
        };
      }
    }

    // Expected CTC / Salary
    if (matchesAny(combined, ['expected ctc', 'expected annual ctc', 'desired ctc', 'expected salary', 'desired salary', 'salary expectation'])) {
      if (pack?.expectedCtcLpa && matchesAny(combined, ['lpa', 'lakhs', 'inr'])) {
        return {
          value: pack.expectedCtcLpa,
          confidence: 0.95,
          source: 'india_pack',
          fieldKey: 'expected_ctc_lpa',
          fieldLabel: 'Expected CTC (LPA)',
          sensitivity: 'ordinary',
          requiresConfirmation: false,
          aiAccessPermitted: true,
          selectionReason: 'Resolved expected CTC in Lakhs Per Annum',
        };
      }
      if (comp?.expectedAnnualCtc) {
        return {
          value: comp.expectedAnnualCtc,
          confidence: 0.93,
          source: 'compensation',
          fieldKey: 'expected_annual_ctc',
          fieldLabel: 'Expected Annual CTC',
          sensitivity: 'ordinary',
          requiresConfirmation: false,
          aiAccessPermitted: true,
          selectionReason: 'Resolved expected annual compensation',
        };
      }
    }

    // ── 6. NOTICE PERIOD (Normalized to days or text) ───────────────────────────
    if (matchesAny(combined, ['notice period', 'notice days', 'notice period in days', 'notice required'])) {
      const days =
        pack?.noticePeriodDays ??
        profile.professional?.noticePeriodDays ??
        (profile.professional?.noticePeriod ? parseInt(profile.professional.noticePeriod, 10) : undefined);

      if (days !== undefined && !isNaN(days)) {
        const isNumericOnly = field.type === 'number' || matchesAny(combined, ['in days', 'days']);
        const val = isNumericOnly ? days : `${days} days`;
        return {
          value: val,
          confidence: 0.95,
          source: 'canonical_professional',
          fieldKey: 'notice_period',
          fieldLabel: 'Notice Period',
          sensitivity: 'ordinary',
          requiresConfirmation: false,
          aiAccessPermitted: true,
          selectionReason: 'Resolved normalized notice period',
        };
      }
    }

    // ── 7. DERIVED YEARS OF EXPERIENCE ─────────────────────────────────────────
    if (matchesAny(combined, ['years of experience', 'years experience', 'total experience', 'work experience in years'])) {
      const allJobs = profile.employmentHistory || profile.work || [];
      const derived = calculateDerivedExperience(allJobs as any, profile.experienceOverrides);

      if (derived.totalExperienceYears !== undefined) {
        const val = field.type === 'number' ? derived.totalExperienceYears : derived.displayTotalExperience;
        return {
          value: val,
          confidence: 0.92,
          source: 'employment_derived',
          fieldKey: 'years_of_experience',
          fieldLabel: 'Years of Experience',
          sensitivity: 'ordinary',
          requiresConfirmation: false,
          aiAccessPermitted: true,
          selectionReason: `Calculated total experience (${derived.displayTotalExperience}) from employment history`,
        };
      }
    }

    // ── 8. RESTRICTED SENSITIVE IDENTIFIERS (Aadhaar / PAN / SSN / Passport) ───
    if (matchesAny(combined, [/\baadhaar\b/, /\badhar\b/]) && pack?.aadhaarNumberMasked) {
      return {
        value: pack.aadhaarNumberMasked,
        confidence: 0.95,
        source: 'india_pack',
        fieldKey: 'aadhaar_number',
        fieldLabel: 'Aadhaar Number',
        sensitivity: 'restricted_identifier',
        requiresConfirmation: true,
        aiAccessPermitted: false, // Strict privacy: never transmit to remote AI!
        selectionReason: 'Aadhaar number detected — gated with restricted confirmation',
      };
    }

    if (matchesAny(combined, [/\bpan card\b/, /\bpan number\b/, /\bpan no\b/]) && pack?.panNumberMasked) {
      return {
        value: pack.panNumberMasked,
        confidence: 0.95,
        source: 'india_pack',
        fieldKey: 'pan_number',
        fieldLabel: 'PAN Number',
        sensitivity: 'restricted_identifier',
        requiresConfirmation: true,
        aiAccessPermitted: false, // Strict privacy: never transmit to remote AI!
        selectionReason: 'PAN number detected — gated with restricted confirmation',
      };
    }

    // ── 9. QUESTION BANK (Saved screening and narrative questions) ─────────────
    if (profile.questionBank && profile.questionBank.length > 0) {
      for (const q of profile.questionBank) {
        if (!q.answer || q.answer.trim() === '') continue;

        const mainMatch = matchesAny(combined, [q.question]);
        const aliasMatch = q.aliases && q.aliases.length > 0 && matchesAny(combined, q.aliases);

        if (mainMatch || aliasMatch) {
          return {
            value: q.answer,
            confidence: mainMatch ? 0.92 : 0.88,
            source: 'question_bank',
            fieldKey: `qb_${q.id}`,
            fieldLabel: q.question,
            sensitivity: 'ordinary',
            requiresConfirmation: !q.isVerified,
            aiAccessPermitted: true,
            selectionReason: `Resolved from question bank ("${q.question}")`,
          };
        }
      }
    }

    // ── 10. WORK PREFERENCES (Workplace type, preferred locations/cities, relocation, shifts, travel) ──
    const wp = profile.workPreferences;
    if (wp) {
      // Workplace arrangement (Remote / Hybrid / Onsite / Flexible)
      if (matchesAny(combined, ['workplace', 'work arrangement', 'remote or on-site', 'remote or onsite', 'hybrid or remote', 'work environment', 'work model', 'work preference', 'telecommute'])) {
        const types = wp.workplaceTypes || [];
        const strVal = types.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(', ');
        return {
          value: strVal || 'Remote, Hybrid',
          confidence: 0.94,
          source: 'work_preferences',
          fieldKey: 'workplace_types',
          fieldLabel: 'Workplace Arrangement',
          sensitivity: 'ordinary',
          requiresConfirmation: false,
          aiAccessPermitted: true,
          selectionReason: 'Resolved preferred workplace arrangements',
        };
      }

      // Preferred Locations / Target Cities
      if (matchesAny(combined, ['preferred location', 'desired location', 'location preference', 'which location', 'which city', 'preferred city', 'target location', 'work location', 'location options'])) {
        const locs = wp.preferredLocations || [];
        if (locs.length > 0) {
          return {
            value: locs.join(', '),
            confidence: 0.93,
            source: 'work_preferences',
            fieldKey: 'preferred_locations',
            fieldLabel: 'Preferred Locations / Cities',
            sensitivity: 'ordinary',
            requiresConfirmation: false,
            aiAccessPermitted: true,
            selectionReason: 'Resolved preferred job locations and cities',
          };
        }
      }

      // Willingness to Relocate
      if (matchesAny(combined, ['relocate', 'willing to relocate', 'open to relocation', 'relocation'])) {
        const willing = wp.willingToRelocate;
        const val = typeof willing === 'boolean' ? (willing ? 'Yes' : 'No') : String(willing);
        return {
          value: field.type === 'checkbox' ? Boolean(willing) : val,
          confidence: 0.95,
          source: 'work_preferences',
          fieldKey: 'willing_to_relocate',
          fieldLabel: 'Willingness to Relocate',
          sensitivity: 'ordinary',
          requiresConfirmation: false,
          aiAccessPermitted: true,
          selectionReason: 'Resolved relocation willingness',
        };
      }

      // Willingness to Travel
      if (matchesAny(combined, ['willing to travel', 'open to travel', 'travel requirement', 'willingness to travel'])) {
        const willing = wp.willingToTravel;
        return {
          value: field.type === 'checkbox' ? willing : willing ? 'Yes' : 'No',
          confidence: 0.94,
          source: 'work_preferences',
          fieldKey: 'willing_to_travel',
          fieldLabel: 'Willingness to Travel',
          sensitivity: 'ordinary',
          requiresConfirmation: false,
          aiAccessPermitted: true,
          selectionReason: 'Resolved travel willingness',
        };
      }

      // Travel Percentage
      if (matchesAny(combined, ['travel percentage', '% travel', 'percentage of travel', 'travel expectation'])) {
        const pct = wp.travelPercentage ?? (wp.willingToTravel ? 25 : 0);
        return {
          value: field.type === 'number' ? pct : `${pct}%`,
          confidence: 0.94,
          source: 'work_preferences',
          fieldKey: 'travel_percentage',
          fieldLabel: 'Travel Percentage',
          sensitivity: 'ordinary',
          requiresConfirmation: false,
          aiAccessPermitted: true,
          selectionReason: 'Resolved travel percentage expectation',
        };
      }

      // Earliest Start Date
      if (matchesAny(combined, ['earliest start date', 'available start date', 'when can you start', 'start date', 'available to begin', 'earliest joining'])) {
        const startDays = wp.earliestStartDays !== undefined
          ? wp.earliestStartDays
          : (wp.earliestStartDate && !isNaN(parseInt(wp.earliestStartDate, 10)) ? parseInt(wp.earliestStartDate, 10) : 0);

        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + startDays);
        const isoDate = targetDate.toISOString().split('T')[0];
        const displayVal = startDays === 0 ? 'Immediately' : `${startDays} days notice (${isoDate})`;

        return {
          value: wp.earliestStartDate || displayVal,
          confidence: 0.95,
          source: 'work_preferences',
          fieldKey: 'earliest_start_date',
          fieldLabel: 'Earliest Start Date',
          sensitivity: 'ordinary',
          requiresConfirmation: false,
          aiAccessPermitted: true,
          selectionReason: 'Resolved earliest available start date',
        };
      }

      // Employment Types (Full-time, Contract, etc.)
      if (matchesAny(combined, ['employment type', 'job type', 'full time or part time', 'contract or full time'])) {
        const types = wp.employmentTypes || ['full_time'];
        const formatted = types.map(t => t.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())).join(', ');
        return {
          value: formatted,
          confidence: 0.92,
          source: 'work_preferences',
          fieldKey: 'employment_types',
          fieldLabel: 'Preferred Employment Types',
          sensitivity: 'ordinary',
          requiresConfirmation: false,
          aiAccessPermitted: true,
          selectionReason: 'Resolved preferred employment types',
        };
      }
    }

    // ── 11. LEGAL DISCLOSURES & SCREENING KNOCKOUTS ───────────────────────────
    const ld = profile.legalDisclosures;
    if (ld) {
      // 18 Years of Age or Older
      if (matchesAny(combined, ['18 years', 'at least 18', 'age 18', 'legal age', '18 or older', 'are you 18'])) {
        const val = ld.over18;
        return {
          value: field.type === 'checkbox' ? val : val ? 'Yes' : 'No',
          confidence: 0.98,
          source: 'legal_disclosures',
          fieldKey: 'over_18',
          fieldLabel: 'Age Verification (18+)',
          sensitivity: 'ordinary',
          requiresConfirmation: false,
          aiAccessPermitted: true,
          selectionReason: 'Resolved age verification requirement',
        };
      }

      // Legally Authorized to Work
      if (matchesAny(combined, ['legally authorized', 'authorized to work', 'legal right to work', 'work eligibility', 'eligible to work'])) {
        const val = ld.legallyAuthorized;
        return {
          value: field.type === 'checkbox' ? val : val ? 'Yes' : 'No',
          confidence: 0.98,
          source: 'legal_disclosures',
          fieldKey: 'legally_authorized',
          fieldLabel: 'Legal Work Authorization',
          sensitivity: 'ordinary',
          requiresConfirmation: false,
          aiAccessPermitted: true,
          selectionReason: 'Resolved legal work authorization status',
        };
      }

      // Visa Sponsorship Requirement
      if (matchesAny(combined, ['require sponsorship', 'visa sponsorship', 'sponsorship for employment', 'future require sponsorship', 'sponsorship now or in the future', 'need sponsorship'])) {
        const val = ld.requiresSponsorship;
        return {
          value: field.type === 'checkbox' ? val : val ? 'Yes' : 'No',
          confidence: 0.98,
          source: 'legal_disclosures',
          fieldKey: 'requires_sponsorship',
          fieldLabel: 'Visa Sponsorship Requirement',
          sensitivity: 'ordinary',
          requiresConfirmation: false,
          aiAccessPermitted: true,
          selectionReason: 'Resolved visa sponsorship requirement',
        };
      }

      // Visa Status / Work Permit Type
      if (matchesAny(combined, ['visa status', 'visa type', 'work permit type', 'current immigration status', 'work authorization status', 'citizenship status'])) {
        if (ld.visaStatus) {
          return {
            value: ld.visaStatus,
            confidence: 0.95,
            source: 'legal_disclosures',
            fieldKey: 'visa_status',
            fieldLabel: 'Visa / Immigration Status',
            sensitivity: 'ordinary',
            requiresConfirmation: false,
            aiAccessPermitted: true,
            selectionReason: 'Resolved immigration / visa status',
          };
        }
      }

      // Security Clearance
      if (matchesAny(combined, ['security clearance', 'clearance level', 'active clearance', 'government clearance'])) {
        const clr = ld.securityClearance || 'none';
        const strVal = clr === 'none' ? 'None' : clr.replace('_', ' ').toUpperCase();
        return {
          value: strVal,
          confidence: 0.94,
          source: 'legal_disclosures',
          fieldKey: 'security_clearance',
          fieldLabel: 'Security Clearance',
          sensitivity: 'ordinary',
          requiresConfirmation: false,
          aiAccessPermitted: true,
          selectionReason: 'Resolved security clearance level',
        };
      }

      // ITAR / Export Control Compliance
      if (matchesAny(combined, ['itar', 'u.s. person', 'us person under itar', 'export control', 'ear compliance'])) {
        const val = ld.itarCompliant ?? true;
        return {
          value: field.type === 'checkbox' ? val : val ? 'Yes' : 'No',
          confidence: 0.96,
          source: 'legal_disclosures',
          fieldKey: 'itar_compliant',
          fieldLabel: 'ITAR / Export Control Compliance',
          sensitivity: 'ordinary',
          requiresConfirmation: false,
          aiAccessPermitted: true,
          selectionReason: 'Resolved ITAR US Person eligibility',
        };
      }

      // Driver's License
      if (matchesAny(combined, ["driver's license", 'drivers license', 'valid driver license', 'driving license'])) {
        const val = ld.hasValidDriverLicense ?? true;
        return {
          value: field.type === 'checkbox' ? val : val ? 'Yes' : 'No',
          confidence: 0.95,
          source: 'legal_disclosures',
          fieldKey: 'driver_license',
          fieldLabel: "Valid Driver's License",
          sensitivity: 'ordinary',
          requiresConfirmation: false,
          aiAccessPermitted: true,
          selectionReason: "Resolved driver's license possession",
        };
      }

      // Previously Employed at Company
      if (matchesAny(combined, ['previously worked', 'previously employed', 'former employee', 'ever worked for', 'worked here before', 'prior employment with'])) {
        const val = ld.previouslyEmployedAtCompany ?? false;
        return {
          value: field.type === 'checkbox' ? val : val ? 'Yes' : 'No',
          confidence: 0.96,
          source: 'legal_disclosures',
          fieldKey: 'previously_employed',
          fieldLabel: 'Previous Employment Disclosure',
          sensitivity: 'ordinary',
          requiresConfirmation: false,
          aiAccessPermitted: true,
          selectionReason: 'Resolved prior employment disclosure',
        };
      }

      // Relatives at Company
      if (matchesAny(combined, ['relatives employed', 'relatives working', 'family members working', 'relative at', 'family at company', 'nepotism'])) {
        const val = ld.hasRelativesAtCompany ?? false;
        return {
          value: field.type === 'checkbox' ? val : val ? 'Yes' : 'No',
          confidence: 0.96,
          source: 'legal_disclosures',
          fieldKey: 'relatives_employed',
          fieldLabel: 'Relatives at Company Disclosure',
          sensitivity: 'ordinary',
          requiresConfirmation: false,
          aiAccessPermitted: true,
          selectionReason: 'Resolved relatives employment disclosure',
        };
      }

      // Non-Compete or Restrictive Covenants
      if (matchesAny(combined, ['non-compete', 'non compete', 'non-solicitation', 'restrictive covenant', 'post-employment restriction'])) {
        const val = ld.hasNonCompeteOrRestrictions ?? false;
        return {
          value: field.type === 'checkbox' ? val : val ? 'Yes' : 'No',
          confidence: 0.95,
          source: 'legal_disclosures',
          fieldKey: 'non_compete',
          fieldLabel: 'Non-Compete Agreement Disclosure',
          sensitivity: 'ordinary',
          requiresConfirmation: false,
          aiAccessPermitted: true,
          selectionReason: 'Resolved non-compete covenant disclosure',
        };
      }

      // Background Check Consent
      if (matchesAny(combined, ['background check', 'background investigation', 'consent to background', 'background screening'])) {
        const val = ld.backgroundCheckConsent ?? true;
        return {
          value: field.type === 'checkbox' ? val : val ? 'Yes' : 'No',
          confidence: 0.97,
          source: 'legal_disclosures',
          fieldKey: 'background_check_consent',
          fieldLabel: 'Background Check Consent',
          sensitivity: 'ordinary',
          requiresConfirmation: false,
          aiAccessPermitted: true,
          selectionReason: 'Resolved background check consent',
        };
      }

      // Drug Screen Consent
      if (matchesAny(combined, ['drug screen', 'drug test', 'drug screening', 'substance test'])) {
        const val = ld.drugScreeningConsent ?? true;
        return {
          value: field.type === 'checkbox' ? val : val ? 'Yes' : 'No',
          confidence: 0.97,
          source: 'legal_disclosures',
          fieldKey: 'drug_screening_consent',
          fieldLabel: 'Drug Screening Consent',
          sensitivity: 'ordinary',
          requiresConfirmation: false,
          aiAccessPermitted: true,
          selectionReason: 'Resolved drug screening consent',
        };
      }

      // Referral Source / How did you hear about us?
      if (matchesAny(combined, ['how did you hear', 'referral source', 'how did you find us', 'where did you hear', 'source of referral', 'how did you hear about this position'])) {
        const src = ld.referralSource || 'LinkedIn';
        return {
          value: src,
          confidence: 0.94,
          source: 'legal_disclosures',
          fieldKey: 'referral_source',
          fieldLabel: 'Referral Source / How Did You Hear',
          sensitivity: 'ordinary',
          requiresConfirmation: false,
          aiAccessPermitted: true,
          selectionReason: 'Resolved application referral source',
        };
      }
    }

    return null;
  }
}

export const semanticProfileMatcher = new SemanticProfileMatcher();
