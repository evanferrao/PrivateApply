/**
 * LaTeX Patch Engine Types
 * Defines the structured, versioned patch protocol, document AST, and validation models.
 */

export interface LatexSection {
  id: string;
  title: string;
  category: 'summary' | 'experience' | 'education' | 'skills' | 'projects' | 'certifications' | 'header' | 'other';
  startLine: number; // 1-indexed
  endLine: number;   // 1-indexed
  startIndex: number; // 0-indexed byte/char offset
  endIndex: number;   // 0-indexed byte/char offset
  content: string;    // Inner section content excluding header/footer
  fullText: string;   // Full section including \section{...} header and boundaries
  rawHeader: string;  // e.g. "\section{Experience}" or "\begin{rSection}{Projects}"
}

export interface LatexDocumentStructure {
  documentClass?: string;
  preamble: string;
  sections: LatexSection[];
  totalLines: number;
  sourceHash: string;
  dependencies: {
    packages: string[];
    inputs: string[];
    figures: string[];
  };
}

export type PatchOperationType = 'replace' | 'insert_after' | 'insert_before' | 'remove';

export interface PatchOperation {
  type: PatchOperationType;
  target_section: string; // section title or id (e.g. "experience", "skills")
  anchor: string;         // exact text to match in target section (sufficiently long & unique)
  content?: string;       // replacement or inserted LaTeX content (empty/omitted for 'remove')
  reason?: string;        // explanation of the change
}

export interface LatexPatch {
  version: number;        // Protocol version (e.g. 1)
  source_hash: string;    // SHA-256 or prefix hash of the original document
  operations: PatchOperation[];
}

export interface PatchValidationError {
  operationIndex: number;
  operationType: string;
  code:
    | 'INVALID_SCHEMA'
    | 'HASH_MISMATCH'
    | 'ANCHOR_NOT_FOUND'
    | 'ANCHOR_AMBIGUOUS'
    | 'OVERLAPPING_OPERATIONS'
    | 'UNBALANCED_BRACES'
    | 'UNBALANCED_ENVIRONMENTS'
    | 'EMPTY_ANCHOR'
    | 'INVALID_TARGET_SECTION';
  message: string;
  details?: Record<string, unknown>;
}

export interface PatchValidationResult {
  valid: boolean;
  errors: PatchValidationError[];
  warnings: string[];
}

export interface DiffLine {
  type: 'unchanged' | 'added' | 'removed';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface SemanticChange {
  section: string;
  type: 'bullet_modified' | 'bullet_added' | 'bullet_removed' | 'text_replaced';
  original?: string;
  updated?: string;
  reason?: string;
}

export interface PatchApplyResult {
  success: boolean;
  originalSource: string;
  modifiedSource: string;
  sourceHash: string;
  appliedOperations: PatchOperation[];
  rejectedOperations: { op: PatchOperation; error: string }[];
  diffLines: DiffLine[];
  semanticChanges: SemanticChange[];
  validation: PatchValidationResult;
}

export interface VersionSnapshot {
  id: string;
  label: string; // "Original", "AI Proposed", "Repair #1", "Compiled", "User Approved"
  timestamp: number;
  source: string;
  hash: string;
  isCompiled: boolean;
  pdfBase64?: string;
  diagnostics?: string[];
}
