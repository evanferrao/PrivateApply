import { describe, it, expect } from 'vitest';
import { SemanticProfileMatcher } from '../semantic-profile-matcher';
import type { UserProfile } from '../profile';
import type { FieldSchema } from '../types';
import { matchFieldToProfile } from '../autofill';
import { createDefaultLegalAndDisclosures } from '../applicant-profile';

function createMockField(label: string, name = '', id = '', type = 'checkbox'): FieldSchema {
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

describe('Applicant Consents & Legal Authorizations Integration', () => {
  const matcher = new SemanticProfileMatcher();

  const mockProfile: UserProfile = {
    personal: {
      firstName: 'Sarah',
      lastName: 'Connor',
      email: 'sarah.connor@cyberdyne.org',
      phone: '+1 4155552671',
      location: 'Los Angeles, CA',
    },
    professional: {},
    work: [],
    education: [],
    skills: [],
    legalDisclosures: {
      ...createDefaultLegalAndDisclosures(),
      consentWhatsApp: true,
      consentSms: true,
      consentPhoneCalls: true,
      consentDncBypass: true,
      consentFutureOpportunities: true,
      consentTalentPoolSharing: true,
      backgroundCheckConsent: true,
      consentReferenceCheck: true,
      drugScreeningConsent: true,
      consentCreditCheck: true,
      consentPrivacyPolicy: true,
      consentDataTransfer: true,
      consentTermsOfService: true,
      consentElectronicSignature: true,
      consentAccurateInformation: true,
      consentAtWillEmployment: true,
      consentArtificialIntelligence: true,
      consentEqualOpportunity: true,
    },
    lastUpdated: Date.now(),
  };

  describe('WhatsApp Messaging & Updates Consent', () => {
    it('matches WhatsApp updates consent question', () => {
      const field = createMockField('Do you consent to receive updates and interview schedules via WhatsApp?', 'whatsapp_consent');
      const match = matcher.match(field, mockProfile);
      expect(match).not.toBeNull();
      expect(match?.fieldKey).toBe('whatsapp_consent');
      expect(match?.value).toBe(true);
    });

    it('matches WhatsApp messaging question for radio / select format', () => {
      const field = createMockField('Consent to contact via WhatsApp', 'whatsapp_optin', '', 'select-one');
      const match = matcher.match(field, mockProfile);
      expect(match?.value).toBe('Yes');
    });
  });

  describe('SMS / Text Messaging Consent', () => {
    it('matches SMS text message notification consent', () => {
      const field = createMockField('Consent to receive SMS text message notifications on your mobile phone', 'sms_notifications');
      const match = matcher.match(field, mockProfile);
      expect(match).not.toBeNull();
      expect(match?.fieldKey).toBe('sms_consent');
      expect(match?.value).toBe(true);
    });
  });

  describe('Direct Recruiter Phone Calls Consent', () => {
    it('matches direct phone call outreach consent', () => {
      const field = createMockField('Consent to receive phone calls from recruiters regarding your application', 'phone_call_consent');
      const match = matcher.match(field, mockProfile);
      expect(match).not.toBeNull();
      expect(match?.fieldKey).toBe('phone_calls_consent');
      expect(match?.value).toBe(true);
    });
  });

  describe('TCPA / Do Not Call (DNC) Bypass Consent', () => {
    it('matches TCPA and Do Not Call bypass consent question', () => {
      const field = createMockField('I consent to automated dialing and prerecorded calls notwithstanding registration on any federal, state, or corporate Do Not Call list (TCPA consent)', 'dnc_bypass');
      const match = matcher.match(field, mockProfile);
      expect(match).not.toBeNull();
      expect(match?.fieldKey).toBe('dnc_bypass_consent');
      expect(match?.value).toBe(true);
    });
  });

  describe('Future Relevant Jobs & Talent Pool Consent', () => {
    it('matches talent community and future relevant opportunities consent', () => {
      const field = createMockField('May we keep your resume on file and contact you about other relevant job opportunities in the future?', 'talent_pool_future');
      const match = matcher.match(field, mockProfile);
      expect(match).not.toBeNull();
      expect(match?.fieldKey).toBe('future_opportunities_consent');
      expect(match?.value).toBe(true);
    });
  });

  describe('Corporate Affiliates & Subsidiary Data Sharing Consent', () => {
    it('matches affiliate sharing consent', () => {
      const field = createMockField('Consent to share candidate profile with corporate affiliates and subsidiary companies for open roles', 'affiliate_sharing');
      const match = matcher.match(field, mockProfile);
      expect(match).not.toBeNull();
      expect(match?.fieldKey).toBe('talent_sharing_consent');
      expect(match?.value).toBe(true);
    });
  });

  describe('Reference and Credit Check Consents', () => {
    it('matches professional reference check consent', () => {
      const field = createMockField('Consent to contact former employers and professional references', 'reference_check');
      const match = matcher.match(field, mockProfile);
      expect(match).not.toBeNull();
      expect(match?.fieldKey).toBe('reference_check_consent');
      expect(match?.value).toBe(true);
    });

    it('matches credit report / consumer report verification consent', () => {
      const field = createMockField('Consent to pre-employment credit check and consumer report verification', 'credit_check');
      const match = matcher.match(field, mockProfile);
      expect(match).not.toBeNull();
      expect(match?.fieldKey).toBe('credit_check_consent');
      expect(match?.value).toBe(true);
    });
  });

  describe('Privacy Policy & Cross-Border Data Transfer', () => {
    it('matches candidate privacy notice and GDPR / CCPA data processing consent', () => {
      const field = createMockField('I agree to the Candidate Privacy Policy and consent to processing my personal application data', 'privacy_consent');
      const match = matcher.match(field, mockProfile);
      expect(match).not.toBeNull();
      expect(match?.fieldKey).toBe('privacy_policy_consent');
      expect(match?.value).toBe(true);
    });

    it('matches international cross-border data transfer consent', () => {
      const field = createMockField('Do you consent to the cross-border international transfer and storage of your personal data?', 'data_transfer');
      const match = matcher.match(field, mockProfile);
      expect(match).not.toBeNull();
      expect(match?.fieldKey).toBe('data_transfer_consent');
      expect(match?.value).toBe(true);
    });
  });

  describe('Terms of Service & E-Sign Disclosures', () => {
    it('matches application portal terms of service agreement', () => {
      const field = createMockField('I agree to the careers portal Terms of Service and application conditions', 'tos_agreement');
      const match = matcher.match(field, mockProfile);
      expect(match).not.toBeNull();
      expect(match?.fieldKey).toBe('terms_of_service_consent');
      expect(match?.value).toBe(true);
    });

    it('matches electronic signature and disclosures consent', () => {
      const field = createMockField('Consent to use electronic signature (E-SIGN) and receive electronic disclosures', 'esign_consent');
      const match = matcher.match(field, mockProfile);
      expect(match).not.toBeNull();
      expect(match?.fieldKey).toBe('electronic_signature_consent');
      expect(match?.value).toBe(true);
    });
  });

  describe('Certification of Accuracy, At-Will, & AI Screening', () => {
    it('matches truthfulness and accurate information certification', () => {
      const field = createMockField('I certify that all statements made in this application are true, accurate, and complete to the best of my knowledge', 'certification_truth');
      const match = matcher.match(field, mockProfile);
      expect(match).not.toBeNull();
      expect(match?.fieldKey).toBe('accurate_information_certification');
      expect(match?.value).toBe(true);
    });

    it('matches at-will employment relationship disclosure', () => {
      const field = createMockField('Acknowledgment of employment at-will relationship', 'at_will_ack');
      const match = matcher.match(field, mockProfile);
      expect(match).not.toBeNull();
      expect(match?.fieldKey).toBe('at_will_employment_consent');
      expect(match?.value).toBe(true);
    });

    it('matches AI and automated screening evaluation consent', () => {
      const field = createMockField('Consent to automated processing and AI screening of job application materials (NYC LL144 / EU AI Act)', 'ai_screening');
      const match = matcher.match(field, mockProfile);
      expect(match).not.toBeNull();
      expect(match?.fieldKey).toBe('ai_screening_consent');
      expect(match?.value).toBe(true);
    });

    it('matches Equal Employment Opportunity disclosure acknowledgment', () => {
      const field = createMockField('Equal Employment Opportunity (EEO) Policy Acknowledgment', 'eeo_ack');
      const match = matcher.match(field, mockProfile);
      expect(match).not.toBeNull();
      expect(match?.fieldKey).toBe('eeo_policy_acknowledgment');
      expect(match?.value).toBe(true);
    });
  });

  describe('Opt-out Handling & Autofill Integration', () => {
    it('respects false when user explicitly revokes a consent', () => {
      const optOutProfile: UserProfile = {
        ...mockProfile,
        legalDisclosures: {
          ...mockProfile.legalDisclosures!,
          consentWhatsApp: false,
          consentDncBypass: false,
        },
      };

      const waField = createMockField('Consent to WhatsApp updates', 'whatsapp');
      expect(matcher.match(waField, optOutProfile)?.value).toBe(false);

      const dncField = createMockField('Do Not Call bypass consent', 'dnc');
      expect(matcher.match(dncField, optOutProfile)?.value).toBe(false);
    });

    it('autofills WhatsApp checkbox via matchFieldToProfile', () => {
      const field = createMockField('Consent to WhatsApp updates & messaging', 'whatsapp_optin', 'wa_cb', 'checkbox');
      const val = matchFieldToProfile(field, mockProfile);
      expect(val).toBe(true);
    });

    it('autofills TCPA / DNC bypass checkbox via matchFieldToProfile', () => {
      const field = createMockField('Do Not Call bypass & automated communication consent', 'dnc_cb', 'tcpa_cb', 'checkbox');
      const val = matchFieldToProfile(field, mockProfile);
      expect(val).toBe(true);
    });

    it('autofills Future Opportunities checkbox via matchFieldToProfile', () => {
      const field = createMockField('Consent to retain profile for future relevant jobs', 'future_cb', 'future_id', 'checkbox');
      const val = matchFieldToProfile(field, mockProfile);
      expect(val).toBe(true);
    });
  });
});
