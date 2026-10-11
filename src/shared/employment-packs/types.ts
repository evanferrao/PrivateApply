/**
 * Employment-Pack Specification & Types
 * Modular, discipline-specific profiles and portfolios (e.g. cs-pack, design-pack, data-science-pack).
 */

export type EmploymentPackFieldDataType =
  | 'url'
  | 'text'
  | 'number'
  | 'choice'
  | 'multi_choice'
  | 'textarea';

export type EmploymentPackSensitivity =
  | 'ordinary'              // Standard profile links and portfolio data
  | 'sensitive_personal'   // Specialized or confidential work samples
  | 'restricted_identifier'; // Proprietary code repositories or sensitive keys

export interface EmploymentPackField {
  id: string;
  key: string;                   // Canonical identifier (e.g. "leetcode_url", "github_url")
  label: string;                 // User-facing title (e.g. "LeetCode Profile")
  category?: string;             // Sub-grouping (e.g. "Competitive Programming", "Repositories", "Portfolio")
  dataType: EmploymentPackFieldDataType;
  aliases: string[];             // Synonyms and ATS form labels for semantic matching
  placeholder?: string;
  validationRegex?: string;      // Optional regex for format validation
  options?: string[];            // Choice options if dataType is 'choice'
  defaultValue?: any;
  helpText?: string;             // Guidance shown to applicant
  sensitivity: EmploymentPackSensitivity;
}

export interface EmploymentPack {
  id: string;                    // e.g. "cs-pack", "design-pack", "data-science-pack"
  name: string;                  // e.g. "Software Engineering & Computer Science"
  discipline: string;            // e.g. "Engineering", "Design", "Data Science"
  icon: string;                  // Emoji or symbol (e.g. "💻", "🎨", "🔬")
  version: string;               // Semantic version (e.g. "1.0.0")
  description: string;
  maintainer?: string;           // Author / Contributor handle
  isCustom?: boolean;            // True if manually imported by user (not built-in)
  fields: EmploymentPackField[];
}
