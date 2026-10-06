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
    | 'question_bank';
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
      const derived = profile.derivedExperience || calculateDerivedExperience(allJobs as any);

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

    return null;
  }
}

export const semanticProfileMatcher = new SemanticProfileMatcher();
