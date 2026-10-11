/**
 * Country-Pack Specification & Types
 * Modular, jurisdiction-specific fields and compliance definitions (e.g., IN-pack, US-pack, DE-pack).
 */

export type CountryPackFieldDataType =
  | 'text'
  | 'number'
  | 'date'
  | 'boolean'
  | 'choice'
  | 'masked_identifier';

export type CountryPackSensitivity =
  | 'ordinary'              // Standard profile data: auto-fill allowed, local/remote AI allowed
  | 'sensitive_personal'   // Demographic, family, disability: confirmation recommended
  | 'restricted_identifier'; // Aadhaar, PAN, SSN, Steuer-ID: strictly guarded, masked display

export interface CountryPackField {
  id: string;
  key: string;                   // Canonical identifier (e.g. "pan_number", "ssn_last_4")
  label: string;                 // User-facing title (e.g. "Permanent Account Number (PAN)")
  dataType: CountryPackFieldDataType;
  aliases: string[];             // Synonyms and ATS form labels for semantic matching
  placeholder?: string;
  validationRegex?: string;      // Optional regex for format validation
  options?: string[];            // Choice options if dataType is 'choice'
  defaultValue?: any;
  helpText?: string;             // Guidance shown to applicant
  sensitivity: CountryPackSensitivity;
}

export interface CountryPack {
  id: string;                    // e.g. "IN-pack", "US-pack", "DE-pack", "GB-pack"
  countryCode: string;           // ISO 3166-1 alpha-2 (e.g. "IN", "US", "DE", "GB")
  countryName: string;           // e.g. "India", "United States", "Germany", "United Kingdom"
  icon: string;                  // Emoji flag or symbol
  version: string;               // Semantic version (e.g. "1.0.0")
  description: string;
  maintainer?: string;           // Author / Contributor GitHub handle or contact
  isCustom?: boolean;            // True if manually imported by user (not built-in)
  fields: CountryPackField[];
}
