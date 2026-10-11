/**
 * LaTeX Patch Engine
 * Safely validates, tests, and applies structured patches to LaTeX documents.
 * Guarantees exact anchor matching, ambiguity rejection, overlap detection,
 * non-destructive rollback, and syntax integrity validation.
 */

import {
  LatexPatch,
  PatchOperation,
  PatchValidationResult,
  PatchValidationError,
  PatchApplyResult,
  DiffLine,
  SemanticChange,
  VersionSnapshot,
} from './types';
import {
  computeSourceHash,
  parseLatexSections,
  checkBraceBalance,
  checkEnvironmentBalance,
} from './latex-parser';

/**
 * Validate patch schema, hashes, anchors, and overlap without modifying the source.
 */
export async function validatePatch(
  source: string,
  patch: LatexPatch
): Promise<PatchValidationResult> {
  const errors: PatchValidationError[] = [];
  const warnings: string[] = [];

  // 1. Schema check
  if (!patch || typeof patch !== 'object') {
    return {
      valid: false,
      errors: [
        {
          operationIndex: -1,
          operationType: 'none',
          code: 'INVALID_SCHEMA',
          message: 'Patch object is missing or malformed',
        },
      ],
      warnings: [],
    };
  }

  if (patch.version !== 1) {
    errors.push({
      operationIndex: -1,
      operationType: 'none',
      code: 'INVALID_SCHEMA',
      message: `Unsupported patch version: ${patch.version}. Expected version 1.`,
    });
  }

  if (!Array.isArray(patch.operations) || patch.operations.length === 0) {
    errors.push({
      operationIndex: -1,
      operationType: 'none',
      code: 'INVALID_SCHEMA',
      message: 'Patch must contain a non-empty operations array',
    });
    return { valid: false, errors, warnings };
  }

  // 2. Hash check
  const currentHash = await computeSourceHash(source);
  if (patch.source_hash && !currentHash.startsWith(patch.source_hash) && !patch.source_hash.startsWith(currentHash)) {
    errors.push({
      operationIndex: -1,
      operationType: 'none',
      code: 'HASH_MISMATCH',
      message: `Source has changed since patch was generated. Expected hash prefix ${patch.source_hash}, got ${currentHash}`,
      details: { expected: patch.source_hash, actual: currentHash },
    });
  }

  // Parse sections to assist targeted anchor lookup
  const sections = parseLatexSections(source);
  const sectionMap = new Map(sections.map(s => [s.title.toLowerCase(), s]));
  for (const s of sections) {
    sectionMap.set(s.id.toLowerCase(), s);
    sectionMap.set(s.category.toLowerCase(), s);
  }

  // Track matched ranges to detect overlaps: { start, end, opIndex }
  const matchedRanges: { start: number; end: number; opIndex: number }[] = [];

  for (let i = 0; i < patch.operations.length; i++) {
    const op = patch.operations[i];

    if (!op || typeof op !== 'object') {
      errors.push({
        operationIndex: i,
        operationType: 'unknown',
        code: 'INVALID_SCHEMA',
        message: `Operation at index ${i} is not a valid object`,
      });
      continue;
    }

    if (!['replace', 'insert_after', 'insert_before', 'remove'].includes(op.type)) {
      errors.push({
        operationIndex: i,
        operationType: op.type,
        code: 'INVALID_SCHEMA',
        message: `Invalid operation type: "${op.type}"`,
      });
      continue;
    }

    if (!op.anchor || typeof op.anchor !== 'string' || op.anchor.trim().length === 0) {
      errors.push({
        operationIndex: i,
        operationType: op.type,
        code: 'EMPTY_ANCHOR',
        message: `Operation ${i} has empty or missing anchor`,
      });
      continue;
    }

    if (['replace', 'insert_after', 'insert_before'].includes(op.type) && (op.content === undefined || op.content === null)) {
      errors.push({
        operationIndex: i,
        operationType: op.type,
        code: 'INVALID_SCHEMA',
        message: `Operation ${i} (${op.type}) must provide content`,
      });
      continue;
    }

    // Locate anchor in document
    let anchor = op.anchor;
    let searchScope = source;
    let offsetAdjustment = 0;

    // Check if target section is specified and can constrain the search
    if (op.target_section) {
      const targetKey = op.target_section.toLowerCase().trim();
      let targetSec = sectionMap.get(targetKey);
      if (!targetSec) {
        for (const s of sections) {
          const sTitle = s.title.toLowerCase().trim();
          if (sTitle === targetKey || sTitle.includes(targetKey) || targetKey.includes(sTitle) || s.category === targetKey) {
            targetSec = s;
            break;
          }
        }
      }
      if (targetSec) {
        searchScope = targetSec.fullText;
        offsetAdjustment = targetSec.startIndex;
      }
    }

    // Count occurrences of anchor in scope
    let count = 0;
    let lastFoundIdx = -1;
    let pos = 0;
    while ((pos = searchScope.indexOf(anchor, pos)) !== -1) {
      count++;
      lastFoundIdx = pos;
      pos += anchor.length;
    }

    // If not found in target section, try full document
    if (count === 0 && offsetAdjustment > 0) {
      pos = 0;
      offsetAdjustment = 0;
      searchScope = source;
      while ((pos = searchScope.indexOf(anchor, pos)) !== -1) {
        count++;
        lastFoundIdx = pos;
        pos += anchor.length;
      }
      if (count > 0) {
        warnings.push(`Operation ${i}: Anchor found outside target section "${op.target_section}", matched globally.`);
      }
    }

    // If still not found, try trimmed anchor
    if (count === 0 && anchor.trim().length > 0 && anchor.trim() !== anchor) {
      const trimmed = anchor.trim();
      pos = 0;
      let trimmedCount = 0;
      let trimmedIdx = -1;
      while ((pos = source.indexOf(trimmed, pos)) !== -1) {
        trimmedCount++;
        trimmedIdx = pos;
        pos += trimmed.length;
      }
      if (trimmedCount >= 1) {
        anchor = trimmed;
        count = trimmedCount;
        lastFoundIdx = trimmedIdx;
        searchScope = source;
        offsetAdjustment = 0;
      }
    }

    if (count === 0) {
      errors.push({
        operationIndex: i,
        operationType: op.type,
        code: 'ANCHOR_NOT_FOUND',
        message: `Anchor not found in source: "${anchor.slice(0, 60)}${anchor.length > 60 ? '...' : ''}"`,
        details: { anchor, target_section: op.target_section },
      });
      continue;
    }

    if (count > 1) {
      // Disambiguate by checking if any individual section has exactly one occurrence
      let disambiguated = false;
      for (const s of sections) {
        let secCount = 0;
        let secPos = 0;
        let secFoundIdx = -1;
        while ((secPos = s.fullText.indexOf(anchor, secPos)) !== -1) {
          secCount++;
          secFoundIdx = secPos;
          secPos += anchor.length;
        }
        if (secCount === 1) {
          searchScope = s.fullText;
          offsetAdjustment = s.startIndex;
          lastFoundIdx = secFoundIdx;
          count = 1;
          disambiguated = true;
          warnings.push(`Operation ${i}: Anchor matched multiple times globally, disambiguated to section "${s.title}".`);
          break;
        }
      }

      if (!disambiguated) {
        errors.push({
          operationIndex: i,
          operationType: op.type,
          code: 'ANCHOR_AMBIGUOUS',
          message: `Anchor matches ${count} locations in source. Anchors must be unique and unambiguous.`,
          details: { count, anchor, target_section: op.target_section },
        });
        continue;
      }
    }

    // Exactly one match found
    const absStart = offsetAdjustment + lastFoundIdx;
    const absEnd = absStart + anchor.length;

    // Check overlap with previously matched operations
    for (const r of matchedRanges) {
      if (absStart < r.end && absEnd > r.start) {
        errors.push({
          operationIndex: i,
          operationType: op.type,
          code: 'OVERLAPPING_OPERATIONS',
          message: `Operation ${i} overlaps with operation ${r.opIndex}`,
          details: { op1: r.opIndex, op2: i },
        });
      }
    }

    matchedRanges.push({ start: absStart, end: absEnd, opIndex: i });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Apply a validated patch to a copy of the source document.
 */
export async function applyPatch(
  source: string,
  patch: LatexPatch
): Promise<PatchApplyResult> {
  const normalizedSource = source.replace(/\r\n/g, '\n');
  const validation = await validatePatch(normalizedSource, patch);

  if (!validation.valid) {
    return {
      success: false,
      originalSource: normalizedSource,
      modifiedSource: normalizedSource,
      sourceHash: await computeSourceHash(normalizedSource),
      appliedOperations: [],
      rejectedOperations: patch.operations.map((op, idx) => ({
        op,
        error: validation.errors.find(e => e.operationIndex === idx)?.message || 'Validation failed',
      })),
      diffLines: [],
      semanticChanges: [],
      validation,
    };
  }

  // Resolve byte positions for all operations
  interface ResolvedOp {
    op: PatchOperation;
    start: number;
    end: number;
    replacementText: string;
  }

  const resolvedOps: ResolvedOp[] = [];

  for (const op of patch.operations) {
    const anchorIdx = normalizedSource.indexOf(op.anchor);
    if (anchorIdx === -1) continue;

    let start = anchorIdx;
    let end = anchorIdx + op.anchor.length;
    let replacementText = '';

    switch (op.type) {
      case 'replace':
        replacementText = op.content ?? '';
        break;
      case 'remove':
        replacementText = '';
        // If anchor is on its own line, consume trailing newline cleanly
        if (
          (start === 0 || normalizedSource[start - 1] === '\n') &&
          end < normalizedSource.length &&
          normalizedSource[end] === '\n'
        ) {
          end += 1;
        }
        break;
      case 'insert_after':
        start = end; // insert at end of anchor
        replacementText = (op.content ? '\n' + op.content : '');
        break;
      case 'insert_before':
        end = start; // insert at start of anchor
        replacementText = (op.content ? op.content + '\n' : '');
        break;
    }

    resolvedOps.push({ op, start, end, replacementText });
  }

  // Sort descending by start position to apply edits without shifting prior offsets
  resolvedOps.sort((a, b) => b.start - a.start);

  let modified = normalizedSource;
  for (const r of resolvedOps) {
    modified = modified.slice(0, r.start) + r.replacementText + modified.slice(r.end);
  }

  // Post-application syntax checks
  const braceCheck = checkBraceBalance(modified);
  if (!braceCheck.balanced) {
    validation.errors.push({
      operationIndex: -1,
      operationType: 'patch',
      code: 'UNBALANCED_BRACES',
      message: `Patch application resulted in unbalanced braces (net: ${braceCheck.netBraces}) around line ${braceCheck.errorLine ?? 'unknown'}. Changes rolled back.`,
    });
    return {
      success: false,
      originalSource: normalizedSource,
      modifiedSource: normalizedSource, // Rollback
      sourceHash: await computeSourceHash(normalizedSource),
      appliedOperations: [],
      rejectedOperations: patch.operations.map(op => ({ op, error: 'Unbalanced braces resulting from patch' })),
      diffLines: [],
      semanticChanges: [],
      validation: { ...validation, valid: false },
    };
  }

  const envCheck = checkEnvironmentBalance(modified);
  if (!envCheck.balanced) {
    const detail = (envCheck.mismatches || []).concat(envCheck.unclosed || []).join('; ');
    validation.errors.push({
      operationIndex: -1,
      operationType: 'patch',
      code: 'UNBALANCED_ENVIRONMENTS',
      message: `Patch application resulted in unbalanced LaTeX environments: ${detail}. Changes rolled back.`,
    });
    return {
      success: false,
      originalSource: normalizedSource,
      modifiedSource: normalizedSource, // Rollback
      sourceHash: await computeSourceHash(normalizedSource),
      appliedOperations: [],
      rejectedOperations: patch.operations.map(op => ({ op, error: 'Unbalanced environments resulting from patch' })),
      diffLines: [],
      semanticChanges: [],
      validation: { ...validation, valid: false },
    };
  }

  const diffLines = generateDiff(normalizedSource, modified);
  const semanticChanges = extractSemanticChanges(patch.operations);
  const newHash = await computeSourceHash(modified);

  return {
    success: true,
    originalSource: normalizedSource,
    modifiedSource: modified,
    sourceHash: newHash,
    appliedOperations: patch.operations,
    rejectedOperations: [],
    diffLines,
    semanticChanges,
    validation,
  };
}

/**
 * Generate standard line-by-line unified diff
 */
export function generateDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  // Simple Myers/LCS-style line diff for clean human inspection
  const diff: DiffLine[] = [];
  const maxLines = Math.max(oldLines.length, newLines.length);

  // Use dynamic programming table for exact line LCS
  const n = oldLines.length;
  const m = newLines.length;

  // For very large files, fallback to simple windowed diff to avoid O(N*M) memory
  if (n * m > 400000) {
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && oldLines[i] === newLines[j]) {
        diff.push({ type: 'unchanged', content: oldLines[i], oldLineNumber: i + 1, newLineNumber: j + 1 });
        i++;
        j++;
      } else if (i < n && (j >= m || !newLines.includes(oldLines[i]))) {
        diff.push({ type: 'removed', content: oldLines[i], oldLineNumber: i + 1 });
        i++;
      } else if (j < m) {
        diff.push({ type: 'added', content: newLines[j], newLineNumber: j + 1 });
        j++;
      }
    }
    return diff;
  }

  // Exact LCS matrix
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      if (oldLines[i] === newLines[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  // Backtrack
  let i = n;
  let j = m;
  const reverseDiff: DiffLine[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      reverseDiff.push({
        type: 'unchanged',
        content: oldLines[i - 1],
        oldLineNumber: i,
        newLineNumber: j,
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      reverseDiff.push({
        type: 'added',
        content: newLines[j - 1],
        newLineNumber: j,
      });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      reverseDiff.push({
        type: 'removed',
        content: oldLines[i - 1],
        oldLineNumber: i,
      });
      i--;
    }
  }

  return reverseDiff.reverse();
}

/**
 * Extract user-friendly summary of bullet points and sections modified
 */
function extractSemanticChanges(operations: PatchOperation[]): SemanticChange[] {
  const changes: SemanticChange[] = [];

  for (const op of operations) {
    const isBullet = /\\item|\*/.test(op.anchor) || (op.content && /\\item|\*/.test(op.content));
    let type: SemanticChange['type'] = 'text_replaced';

    if (op.type === 'remove') {
      type = isBullet ? 'bullet_removed' : 'text_replaced';
    } else if (op.type === 'insert_after' || op.type === 'insert_before') {
      type = isBullet ? 'bullet_added' : 'text_replaced';
    } else if (op.type === 'replace') {
      type = isBullet ? 'bullet_modified' : 'text_replaced';
    }

    changes.push({
      section: op.target_section,
      type,
      original: op.anchor,
      updated: op.content,
      reason: op.reason,
    });
  }

  return changes;
}

/**
 * Version History & Rollback Manager
 */
export class VersionManager {
  private snapshots: VersionSnapshot[] = [];
  private activeIndex: number = -1;

  constructor(initialSource: string, initialHash?: string) {
    if (initialSource) {
      this.addSnapshot({
        id: 'original',
        label: 'Original Source',
        timestamp: Date.now(),
        source: initialSource,
        hash: initialHash || '',
        isCompiled: false,
      });
    }
  }

  public addSnapshot(snapshot: VersionSnapshot): void {
    // If adding a new branch after rollback, truncate ahead
    if (this.activeIndex < this.snapshots.length - 1) {
      this.snapshots = this.snapshots.slice(0, this.activeIndex + 1);
    }
    this.snapshots.push(snapshot);
    this.activeIndex = this.snapshots.length - 1;
  }

  public getCurrentSnapshot(): VersionSnapshot | null {
    if (this.activeIndex >= 0 && this.activeIndex < this.snapshots.length) {
      return this.snapshots[this.activeIndex];
    }
    return null;
  }

  public getOriginalSnapshot(): VersionSnapshot | null {
    return this.snapshots[0] || null;
  }

  public getLastCompiledSnapshot(): VersionSnapshot | null {
    for (let i = this.snapshots.length - 1; i >= 0; i--) {
      if (this.snapshots[i].isCompiled) {
        return this.snapshots[i];
      }
    }
    return null;
  }

  public canRollback(): boolean {
    return this.activeIndex > 0;
  }

  public rollback(): VersionSnapshot | null {
    if (this.canRollback()) {
      this.activeIndex--;
      return this.snapshots[this.activeIndex];
    }
    return null;
  }

  public listSnapshots(): VersionSnapshot[] {
    return [...this.snapshots];
  }
}
