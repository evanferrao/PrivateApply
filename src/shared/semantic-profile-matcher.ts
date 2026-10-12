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
import { BUILTIN_COUNTRY_PACKS } from './country-packs';
import { BUILTIN_EMPLOYMENT_PACKS } from './employment-packs';
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
    | 'country_pack'
    | 'employment_pack'
    | 'employment_derived'
    | 'compensation'
    | 'reference'
    | 'custom_field'
    | 'question_bank'
    | 'work_preferences'
    | 'legal_disclosures'
    | 'passport_details'
    | 'certification'
    | 'social_link';
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

interface PackFieldDef {
  key: string;
  label: string;
  aliases?: string[];
  sensitivity?: string;
}

interface PackDef {
  id: string;
  fields: readonly PackFieldDef[] | PackFieldDef[];
}

function matchPackCollection(
  packsData: Record<string, Record<string, any>> | undefined,
  builtinPacks: readonly PackDef[],
  combined: string,
  defaultSource: 'country_pack' | 'employment_pack',
  packTypeLabel: string
): SemanticMatchResult | null {
  if (!packsData) return null;

  for (const pack of builtinPacks) {
    const packData = packsData[pack.id];
    if (!packData) continue;

    for (const fieldDef of pack.fields) {
      const val = packData[fieldDef.key];
      if (val === undefined || val === null || String(val).trim() === '') continue;

      const keyMatch = matchesAny(combined, [fieldDef.key, fieldDef.label]);
      const aliasMatch = fieldDef.aliases && fieldDef.aliases.length > 0 && matchesAny(combined, fieldDef.aliases);

      if (keyMatch || aliasMatch) {
        return {
          value: val,
          confidence: keyMatch ? 0.95 : 0.9,
          source: defaultSource === 'country_pack' && pack.id === 'IN-pack' ? 'india_pack' : defaultSource,
          fieldKey: `${pack.id}_${fieldDef.key}`,
          fieldLabel: fieldDef.label,
          sensitivity: (fieldDef.sensitivity as SensitivityLevel) || 'ordinary',
          requiresConfirmation: fieldDef.sensitivity === 'restricted_identifier',
          aiAccessPermitted: fieldDef.sensitivity !== 'restricted_identifier',
          selectionReason: `Matched ${packTypeLabel} (${pack.id}) field "${fieldDef.label}" via ${keyMatch ? 'key/label' : 'alias'}`,
        };
      }
    }
  }

  for (const [packId, packData] of Object.entries(packsData)) {
    if (!packData || builtinPacks.some(b => b.id === packId)) continue;
    for (const [key, val] of Object.entries(packData)) {
      if (val === undefined || val === null || String(val).trim() === '') continue;
      const cleanKey = key.replace(/_/g, ' ');
      if (matchesAny(combined, [key, cleanKey])) {
        return {
          value: val,
          confidence: 0.9,
          source: defaultSource,
          fieldKey: `${packId}_${key}`,
          fieldLabel: key,
          sensitivity: 'ordinary',
          requiresConfirmation: false,
          aiAccessPermitted: true,
          selectionReason: `Matched Custom ${packTypeLabel} (${packId}) field "${key}"`,
        };
      }
    }
  }

  return null;
}

interface SocialPlatformRule {
  prop: keyof NonNullable<UserProfile['professional']>;
  patterns: string[];
  fieldKey: string;
  fieldLabel: string;
  reason: string;
  source?: 'canonical_professional' | 'social_link';
  confidence?: number;
}

const SOCIAL_PLATFORM_RULES: SocialPlatformRule[] = [
  {
    prop: 'linkedin',
    patterns: ['linkedin', 'linked-in', 'linkedin profile', 'linkedin url', 'linkedin link'],
    fieldKey: 'linkedin',
    fieldLabel: 'LinkedIn Profile',
    reason: 'Resolved candidate LinkedIn profile URL',
    source: 'canonical_professional',
    confidence: 0.96,
  },
  {
    prop: 'github',
    patterns: ['github', 'github url', 'github profile', 'github link', 'git repo', 'github repository'],
    fieldKey: 'github',
    fieldLabel: 'GitHub Profile',
    reason: 'Resolved candidate GitHub profile URL',
    source: 'canonical_professional',
    confidence: 0.95,
  },
  {
    prop: 'twitter',
    patterns: ['twitter', 'twitter url', 'twitter profile', 'twitter handle', 'x profile', 'x url', 'x handle', 'twitter/x', 'x/twitter'],
    fieldKey: 'twitter',
    fieldLabel: 'Twitter / X Profile',
    reason: 'Resolved candidate Twitter / X profile URL',
  },
  {
    prop: 'youtube',
    patterns: ['youtube', 'youtube url', 'youtube channel', 'video portfolio'],
    fieldKey: 'youtube',
    fieldLabel: 'YouTube Channel',
    reason: 'Resolved candidate YouTube channel URL',
  },
  {
    prop: 'instagram',
    patterns: ['instagram', 'instagram url', 'instagram profile', 'instagram handle', 'ig profile'],
    fieldKey: 'instagram',
    fieldLabel: 'Instagram Profile',
    reason: 'Resolved candidate Instagram profile URL',
  },
  {
    prop: 'facebook',
    patterns: ['facebook', 'facebook url', 'facebook profile', 'fb profile'],
    fieldKey: 'facebook',
    fieldLabel: 'Facebook Profile',
    reason: 'Resolved candidate Facebook profile URL',
  },
  {
    prop: 'threads',
    patterns: ['threads', 'threads url', 'threads profile', 'meta threads'],
    fieldKey: 'threads',
    fieldLabel: 'Threads Profile',
    reason: 'Resolved candidate Threads profile URL',
  },
  {
    prop: 'bluesky',
    patterns: ['bluesky', 'bsky', 'bluesky url', 'bluesky profile'],
    fieldKey: 'bluesky',
    fieldLabel: 'Bluesky Profile',
    reason: 'Resolved candidate Bluesky profile URL',
  },
  {
    prop: 'medium',
    patterns: ['medium', 'medium url', 'medium profile', 'tech blog', 'blog url'],
    fieldKey: 'medium',
    fieldLabel: 'Medium / Tech Blog',
    reason: 'Resolved candidate Medium/blog URL',
  },
];

interface ConsentRule {
  key: keyof NonNullable<UserProfile['legalDisclosures']>;
  patterns: Array<string | RegExp>;
  fieldKey: string;
  fieldLabel: string;
  reason: string;
  confidence?: number;
}

const CONSENT_RULES: ConsentRule[] = [
  {
    key: 'backgroundCheckConsent',
    patterns: ['background check', 'background investigation', 'consent to background', 'background screening', 'pre-employment background'],
    fieldKey: 'background_check_consent',
    fieldLabel: 'Background Check Consent',
    reason: 'Resolved background check consent',
  },
  {
    key: 'consentReferenceCheck',
    patterns: ['reference check', 'reference_check', 'contact references', 'reference verification', 'contact former employers', 'contact your former employers', 'contact previous employers', 'professional references', 'references consent'],
    fieldKey: 'reference_check_consent',
    fieldLabel: 'Reference Check Consent',
    reason: 'Resolved reference check consent',
  },
  {
    key: 'consentCreditCheck',
    patterns: ['credit check', 'credit report', 'credit history', 'consumer report', 'financial background check', 'financial history check'],
    fieldKey: 'credit_check_consent',
    fieldLabel: 'Credit / Consumer Report Check Consent',
    reason: 'Resolved credit check consent',
  },
  {
    key: 'drugScreeningConsent',
    patterns: ['drug screen', 'drug test', 'drug screening', 'substance test', 'alcohol and drug'],
    fieldKey: 'drug_screening_consent',
    fieldLabel: 'Drug Screening Consent',
    reason: 'Resolved drug screening consent',
  },
  {
    key: 'consentWhatsApp',
    patterns: ['whatsapp', 'whats app', 'updates via whatsapp', 'messages via whatsapp', 'whatsapp notifications', 'whatsapp consent', 'contact via whatsapp'],
    fieldKey: 'whatsapp_consent',
    fieldLabel: 'WhatsApp Messaging & Updates Consent',
    reason: 'Resolved WhatsApp communications consent',
    confidence: 0.98,
  },
  {
    key: 'consentDncBypass',
    patterns: ['do not call', 'dnc', 'tcpa', 'telephone consumer protection', 'automated dialing', 'autodialer', 'prerecorded voice', 'artificial voice', 'bypass do not call', 'national do not call', 'federal do not call', 'automated technology to contact'],
    fieldKey: 'dnc_bypass_consent',
    fieldLabel: 'TCPA / Do Not Call (DNC) Bypass Consent',
    reason: 'Resolved Do Not Call bypass / automated calling consent',
    confidence: 0.98,
  },
  {
    key: 'consentSms',
    patterns: ['sms consent', 'text message', 'text messages', 'sms notifications', 'consent to receive texts', 'consent to receive sms', 'automated texts', 'text messaging consent', 'sms updates', 'receive sms'],
    fieldKey: 'sms_consent',
    fieldLabel: 'SMS / Text Messages Consent',
    reason: 'Resolved SMS text notifications consent',
  },
  {
    key: 'consentPhoneCalls',
    patterns: ['consent to call', 'consent to phone', 'phone calls', 'telephone calls', 'contact you by phone', 'contact via phone', 'reach you by phone', 'calls regarding your application'],
    fieldKey: 'phone_calls_consent',
    fieldLabel: 'Direct Phone Calls Consent',
    reason: 'Resolved phone calls communication consent',
  },
  {
    key: 'consentFutureOpportunities',
    patterns: ['future opportunities', 'future roles', 'future job', 'other relevant jobs', 'other open roles', 'talent pool', 'talent community', 'talent network', 'retain your profile', 'keep your resume on file', 'future openings', 'other positions at', 'future considerations', 'candidate pool', 'keep on file'],
    fieldKey: 'future_opportunities_consent',
    fieldLabel: 'Future Job Opportunities & Talent Pool Consent',
    reason: 'Resolved future job opportunities and talent pool retention consent',
  },
  {
    key: 'consentTalentPoolSharing',
    patterns: ['affiliates', 'subsidiaries', 'group companies', 'affiliated companies', 'share your information with other companies', 'share profile with affiliates', 'corporate entities', 'other entities'],
    fieldKey: 'talent_sharing_consent',
    fieldLabel: 'Affiliate & Subsidiary Profile Sharing Consent',
    reason: 'Resolved corporate affiliates profile sharing consent',
    confidence: 0.96,
  },
  {
    key: 'consentPrivacyPolicy',
    patterns: ['privacy policy', 'privacy notice', 'candidate privacy', 'data processing consent', 'consent to process personal data', 'consent to processing of my personal data', 'gdpr', 'ccpa', 'data protection policy', 'processing of my application data', 'protect your data', 'data privacy'],
    fieldKey: 'privacy_policy_consent',
    fieldLabel: 'Privacy Policy & Data Processing Consent',
    reason: 'Resolved Candidate Privacy Policy and data processing consent',
    confidence: 0.98,
  },
  {
    key: 'consentDataTransfer',
    patterns: ['cross-border', 'data transfer', 'international transfer', 'transfer outside', 'transfer of personal data internationally', 'transferred across borders', 'transfer personal data outside'],
    fieldKey: 'data_transfer_consent',
    fieldLabel: 'International Data Transfer Consent',
    reason: 'Resolved international cross-border data transfer consent',
  },
  {
    key: 'consentTermsOfService',
    patterns: ['terms of service', 'terms and conditions', 'terms of use', 'application terms', 'portal terms', 'agree to the terms', 'accept terms', 'applicant agreement'],
    fieldKey: 'terms_of_service_consent',
    fieldLabel: 'Terms of Service Consent',
    reason: 'Resolved Terms of Service agreement',
  },
  {
    key: 'consentElectronicSignature',
    patterns: ['electronic signature', 'e-sign', 'electronic disclosures', 'sign electronically', 'consent to electronic delivery', 'consent to electronic records', 'electronic consent'],
    fieldKey: 'electronic_signature_consent',
    fieldLabel: 'Electronic Signature & Disclosures Consent',
    reason: 'Resolved electronic signature and disclosures consent',
    confidence: 0.98,
  },
  {
    key: 'consentAccurateInformation',
    patterns: ['true and correct', 'true and accurate', 'certify that all statements', 'accuracy of information', 'certify the information', 'true to the best of my knowledge', 'falsification', 'penalty of perjury', 'accurate declaration', 'certify that the information', 'acknowledgment and certification', 'truthfulness'],
    fieldKey: 'accurate_information_certification',
    fieldLabel: 'Information Accuracy & Truthfulness Certification',
    reason: 'Resolved application accuracy and truthfulness certification',
    confidence: 0.98,
  },
  {
    key: 'consentAtWillEmployment',
    patterns: ['at-will', 'at will employment', 'at-will relationship', 'employment at will', 'at will basis'],
    fieldKey: 'at_will_employment_consent',
    fieldLabel: 'At-Will Employment Acknowledgment',
    reason: 'Resolved at-will employment disclosure acknowledgment',
  },
  {
    key: 'consentArtificialIntelligence',
    patterns: ['artificial intelligence', 'ai screening', 'automated decision', 'automated employment decision', 'ai evaluation', 'automated tool', 'use of ai', 'automated processing'],
    fieldKey: 'ai_screening_consent',
    fieldLabel: 'AI & Automated Decision-Making Consent',
    reason: 'Resolved AI screening and automated decision consent',
  },
  {
    key: 'consentEqualOpportunity',
    patterns: ['equal employment opportunity', 'equal opportunity employer', 'eeo policy', 'non-discrimination policy', 'eeo disclosure'],
    fieldKey: 'eeo_policy_acknowledgment',
    fieldLabel: 'Equal Employment Opportunity (EEO) Policy Acknowledgment',
    reason: 'Resolved EEO policy acknowledgment',
    confidence: 0.96,
  },
];

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

    // ── 2. COUNTRY PACKS (Modular jurisdiction fields: US-pack, DE-pack, GB-pack, IN-pack, custom) ──
    const countryMatch = matchPackCollection(profile.countryPacksData, BUILTIN_COUNTRY_PACKS, combined, 'country_pack', 'Country-Pack');
    if (countryMatch) return countryMatch;

    // ── 2.5. EMPLOYMENT PACKS (Discipline profiles: LeetCode, HackerRank, GitHub, Figma, etc.) ──
    const empMatch = matchPackCollection(profile.employmentPacksData, BUILTIN_EMPLOYMENT_PACKS, combined, 'employment_pack', 'Employment-Pack');
    if (empMatch) return empMatch;

    // ── 3. FAMILY / GUARDIAN / EMERGENCY CONTACTS ──────────────────────────────
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

    // ── 7.5. PROFESSIONAL & SOCIAL MEDIA LINKS ─────────────────────────────────
    const prof = profile.professional;
    if (prof) {
      for (const rule of SOCIAL_PLATFORM_RULES) {
        const val = prof[rule.prop];
        if (val && matchesAny(combined, rule.patterns)) {
          return {
            value: val as string,
            confidence: rule.confidence ?? 0.95,
            source: rule.source ?? 'social_link',
            fieldKey: rule.fieldKey,
            fieldLabel: rule.fieldLabel,
            sensitivity: 'ordinary',
            requiresConfirmation: false,
            aiAccessPermitted: true,
            selectionReason: rule.reason,
          };
        }
      }

      // Portfolio / Website (guard against referral source "how did you hear")
      if (matchesAny(combined, ['portfolio', 'portfolio url', 'personal website', 'website url', 'personal site', 'online portfolio', 'web page']) &&
          !matchesAny(combined, ['hear', 'find', 'referral', 'source']) &&
          (prof.portfolio || prof.website)) {
        return {
          value: prof.portfolio || prof.website!,
          confidence: 0.94,
          source: 'canonical_professional',
          fieldKey: 'portfolio',
          fieldLabel: 'Portfolio / Website',
          sensitivity: 'ordinary',
          requiresConfirmation: false,
          aiAccessPermitted: true,
          selectionReason: 'Resolved candidate portfolio/website URL',
        };
      }
    }

    // ── 7.6. CERTIFICATIONS & LICENSES ─────────────────────────────────────────
    const certs = profile.certifications;
    if (certs && certs.length > 0) {
      // Check for matching specific certifications by name, issuer, issuer aliases, or exam code
      for (const cert of certs) {
        const issuerTerms = [cert.issuer, ...(cert.issuerAliases || [])].filter(Boolean);
        const isIssuerMatch = issuerTerms.length > 0 && matchesAny(combined, issuerTerms);
        const isNameMatch = matchesAny(combined, [cert.name]);
        const isExamMatch = Boolean(cert.examCode && matchesAny(combined, [cert.examCode]));

        if (isNameMatch || isExamMatch || isIssuerMatch) {
          const certFieldRules = [
            {
              patterns: ['verification', 'verify', 'badge link', 'badge url', 'credential url', 'credential link', 'credly', 'verify credential'],
              fieldSuffix: 'verification_url',
              labelSuffix: 'Verification URL',
              reasonLabel: 'verification link',
              val: cert.verificationUrl,
              conf: 0.95,
            },
            {
              patterns: ['credential id', 'credential #', 'license number', 'license no', 'license #', 'certificate number', 'certificate id'],
              fieldSuffix: 'credential_id',
              labelSuffix: 'Credential ID',
              reasonLabel: 'credential ID / license number',
              val: cert.credentialId,
              conf: 0.95,
            },
            {
              patterns: ['exam code', 'exam #', 'exam number'],
              fieldSuffix: 'exam_code',
              labelSuffix: 'Exam Code',
              reasonLabel: 'exam code',
              val: cert.examCode,
              conf: 0.95,
            },
            {
              patterns: ['issue date', 'date of issue', 'date achieved', 'certification date', 'issued date'],
              fieldSuffix: 'issue_date',
              labelSuffix: 'Issue Date',
              reasonLabel: 'issue date',
              val: cert.issueDate,
              conf: 0.93,
            },
            {
              patterns: ['expiry date', 'expiration date', 'valid until', 'expiry', 'expiration'],
              fieldSuffix: 'expiry_date',
              labelSuffix: 'Expiration Date',
              reasonLabel: 'expiration date',
              val: cert.doesNotExpire ? 'Does not expire' : (cert.expiryDate || 'Does not expire'),
              conf: 0.93,
            },
          ];

          for (const rule of certFieldRules) {
            if (matchesAny(combined, rule.patterns) && rule.val) {
              return {
                value: rule.val,
                confidence: rule.conf,
                source: 'certification',
                fieldKey: `cert_${cert.id}_${rule.fieldSuffix}`,
                fieldLabel: `${cert.name} ${rule.labelSuffix}`,
                sensitivity: 'ordinary',
                requiresConfirmation: false,
                aiAccessPermitted: true,
                selectionReason: `Resolved ${rule.reasonLabel} for "${cert.name}"`,
              };
            }
          }

          // If it's a yes/no / checkbox question about having this certification
          if (field.type === 'checkbox' || matchesAny(combined, ['do you have', 'do you hold', 'are you certified', 'certified in', 'holder of'])) {
            return {
              value: field.type === 'checkbox' ? true : 'Yes',
              confidence: 0.94,
              source: 'certification',
              fieldKey: `cert_${cert.id}_status`,
              fieldLabel: `${cert.name} Certified Status`,
              sensitivity: 'ordinary',
              requiresConfirmation: false,
              aiAccessPermitted: true,
              selectionReason: `Confirmed active certification "${cert.name}"`,
            };
          }

          // General return: certification title or full reference
          return {
            value: cert.name,
            confidence: 0.93,
            source: 'certification',
            fieldKey: `cert_${cert.id}_name`,
            fieldLabel: cert.name,
            sensitivity: 'ordinary',
            requiresConfirmation: false,
            aiAccessPermitted: true,
            selectionReason: `Matched certification "${cert.name}" via ${isNameMatch ? 'name' : isExamMatch ? 'exam code' : 'organization alias'}`,
          };
        }
      }

      // General certifications questions (e.g. "Certifications", "Licenses and Certifications", "Do you hold any certifications?")
      if (matchesAny(combined, ['certifications', 'licenses', 'professional certifications', 'credentials', 'certifications and licenses', 'licenses & certifications', 'do you hold any certifications', 'do you have any certifications'])) {
        if (field.type === 'checkbox') {
          return {
            value: true,
            confidence: 0.95,
            source: 'certification',
            fieldKey: 'certifications_held',
            fieldLabel: 'Certifications Held',
            sensitivity: 'ordinary',
            requiresConfirmation: false,
            aiAccessPermitted: true,
            selectionReason: 'Confirmed candidate holds professional certifications',
          };
        }

        const summary = certs.map(c => `${c.name} (${c.issuer}${c.credentialId ? `, ID: ${c.credentialId}` : ''})`).join('; ');
        return {
          value: summary,
          confidence: 0.92,
          source: 'certification',
          fieldKey: 'certifications_summary',
          fieldLabel: 'Certifications & Licenses Summary',
          sensitivity: 'ordinary',
          requiresConfirmation: false,
          aiAccessPermitted: true,
          selectionReason: 'Summarized candidate professional certifications and licenses',
        };
      }
    } else if (matchesAny(combined, ['do you hold any certifications', 'do you have any certifications']) && field.type === 'checkbox') {
      return {
        value: false,
        confidence: 0.9,
        source: 'certification',
        fieldKey: 'certifications_held',
        fieldLabel: 'Certifications Held',
        sensitivity: 'ordinary',
        requiresConfirmation: false,
        aiAccessPermitted: true,
        selectionReason: 'No certifications registered in profile',
      };
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

    // Passport metadata details
    const passportFieldRules = [
      {
        patterns: [/\bpassport\s*(issuing\s*country|country\s*of\s*issue|issue\s*country|issued\s*by|authority)\b/, /\bpassport\s*country\b/],
        val: profile.passport?.issuingCountry,
        key: 'passport_issuing_country',
        label: 'Passport Issuing Country',
        reason: 'Passport issuing country resolved',
      },
      {
        patterns: [/\bpassport\s*(expiry|expiration|valid\s*until|expires)\b/, /\bpassport\s*exp(ir)?\s*(date)?\b/],
        val: profile.passport?.expiryDate,
        key: 'passport_expiry_date',
        label: 'Passport Expiration Date',
        reason: 'Passport expiration date resolved',
      },
      {
        patterns: [/\bpassport\s*(issue\s*date|date\s*of\s*issue|issued\s*date)\b/],
        val: profile.passport?.issueDate,
        key: 'passport_issue_date',
        label: 'Passport Issue Date',
        reason: 'Passport issue date resolved',
      },
      {
        patterns: [/\bpassport\s*(nationality|citizenship)\b/],
        val: profile.passport?.nationality || profile.personal?.nationality || profile.personal?.citizenship,
        key: 'passport_nationality',
        label: 'Passport Nationality',
        reason: 'Passport nationality resolved',
      },
    ];

    for (const pr of passportFieldRules) {
      if (matchesAny(combined, pr.patterns) && pr.val) {
        return {
          value: pr.val,
          confidence: 0.92,
          source: 'passport_details',
          fieldKey: pr.key,
          fieldLabel: pr.label,
          sensitivity: 'sensitive_personal',
          requiresConfirmation: false,
          aiAccessPermitted: true,
          selectionReason: pr.reason,
        };
      }
    }

    // Passport Number — strictly protected identifier (never sent to remote AI, requires explicit user confirmation)
    const isSpecificPassportNonNumber = matchesAny(combined, [/\b(country|issue|expiry|expiration|valid|authority|photo|upload|file|date)\b/]);
    if (!isSpecificPassportNonNumber && matchesAny(combined, [/\bpassport\s*(number|no|#|id|num)?\b/, /\btravel\s*doc(ument)?\s*(number|no|#)?\b/]) && profile.passport?.passportNumber) {
      return {
        value: profile.passport.passportNumber,
        confidence: 0.95,
        source: 'passport_details',
        fieldKey: 'passport_number',
        fieldLabel: 'Passport Number',
        sensitivity: 'restricted_identifier',
        requiresConfirmation: true,
        aiAccessPermitted: false, // Strict privacy: never transmit to remote AI!
        selectionReason: 'Passport number detected — strictly protected identifier requiring explicit confirmation',
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

      for (const rule of CONSENT_RULES) {
        if (matchesAny(combined, rule.patterns)) {
          const val = (ld as any)[rule.key] ?? true;
          return {
            value: field.type === 'checkbox' ? val : val ? 'Yes' : 'No',
            confidence: rule.confidence ?? 0.97,
            source: 'legal_disclosures',
            fieldKey: rule.fieldKey,
            fieldLabel: rule.fieldLabel,
            sensitivity: 'ordinary',
            requiresConfirmation: false,
            aiAccessPermitted: true,
            selectionReason: rule.reason,
          };
        }
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
