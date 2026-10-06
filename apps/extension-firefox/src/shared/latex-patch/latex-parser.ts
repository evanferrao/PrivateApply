/**
 * Robust LaTeX document parser for résumé source files.
 * Handles balanced braces, comment filtering, environment tracking,
 * and section boundary identification without naive regex pitfalls.
 */

import {
  LatexSection,
  LatexDocumentStructure,
} from './types';

/**
 * Fast simple SHA-256-like hex digest for source versioning in browser/node environment.
 * Uses Web Crypto if available, with deterministic fallback for tests.
 */
export async function computeSourceHash(source: string): Promise<string> {
  const normalized = source.replace(/\r\n/g, '\n');
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const msgBuffer = new TextEncoder().encode(normalized);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
    } catch {
      // fallback if subtle crypto unavailable
    }
  }

  // Deterministic FNV-1a 64-bit style hash fallback
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i++) {
    const code = normalized.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x01000193);
    h2 = Math.imul(h2 ^ ((code << 5) | (code >>> 11)), 0x01000193);
  }
  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return (hex1 + hex2).slice(0, 16);
}

/**
 * Categorize a section title into standard résumé categories
 */
export function categorizeSectionTitle(title: string): LatexSection['category'] {
  const clean = title.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();
  if (/\b(summary|objective|profile|about|overview|statement|bio)\b/.test(clean)) return 'summary';
  if (/\b(experience|employment|work|history|career|professional|positions?|internships?|jobs?|co\s*op)\b/.test(clean)) return 'experience';
  if (/\b(education|academic|degrees?|university|college|schools?|coursework|studies)\b/.test(clean)) return 'education';
  if (/\b(skills?|technical|technologies|proficiencies|competencies|tools|languages|frameworks|stack|expertise)\b/.test(clean)) return 'skills';
  if (/\b(projects?|portfolio|open\s*source|personal\s*projects?|creations|hackathons?|code|apps?|contributions?)\b/.test(clean)) return 'projects';
  if (/\b(certifications?|certificates?|licenses?|awards?|honors?|achievements?|publications?|activities|leadership|extracurriculars?)\b/.test(clean)) return 'certifications';
  if (/\b(contact|header|personal|links|info)\b/.test(clean)) return 'header';
  return 'other';
}

/**
 * Find the closing brace matching the opening brace at startIndex in text.
 * Skips escaped braces like \{ and \}.
 * Returns the index of the matching '}', or -1 if unbalanced.
 */
export function findMatchingBrace(text: string, startIndex: number): number {
  if (text[startIndex] !== '{') return -1;
  let depth = 0;
  for (let i = startIndex; i < text.length; i++) {
    if (i > 0 && text[i - 1] === '\\') {
      // Escaped character, skip
      continue;
    }
    if (text[i] === '{') {
      depth++;
    } else if (text[i] === '}') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

/**
 * Check if the character at index `pos` in `text` is inside a LaTeX comment.
 * In LaTeX, '%' starts a comment unless escaped as '\%'.
 */
export function isPositionCommented(text: string, pos: number): boolean {
  // Find start of current line
  let lineStart = text.lastIndexOf('\n', pos - 1);
  lineStart = lineStart === -1 ? 0 : lineStart + 1;

  for (let i = lineStart; i < pos; i++) {
    if (text[i] === '%' && (i === 0 || text[i - 1] !== '\\')) {
      return true;
    }
  }
  return false;
}

/**
 * Verify if LaTeX source has balanced curly braces (ignoring comments & escaped \{ \})
 */
export function checkBraceBalance(text: string): { balanced: boolean; netBraces: number; errorLine?: number } {
  let depth = 0;
  let inComment = false;
  let currentLine = 1;
  let firstUnbalancedLine = -1;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '\n') {
      inComment = false;
      currentLine++;
      continue;
    }
    if (inComment) continue;

    if (char === '%' && (i === 0 || text[i - 1] !== '\\')) {
      inComment = true;
      continue;
    }

    if (i > 0 && text[i - 1] === '\\') {
      // Escaped \{ or \} or other command
      continue;
    }

    if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth < 0 && firstUnbalancedLine === -1) {
        firstUnbalancedLine = currentLine;
      }
    }
  }

  return {
    balanced: depth === 0,
    netBraces: depth,
    errorLine: depth !== 0 ? (firstUnbalancedLine !== -1 ? firstUnbalancedLine : currentLine) : undefined,
  };
}

/**
 * Verify balanced \begin{env} and \end{env} statements
 */
export function checkEnvironmentBalance(text: string): {
  balanced: boolean;
  unclosed?: string[];
  mismatches?: string[];
} {
  const envStack: { name: string; line: number }[] = [];
  const mismatches: string[] = [];

  const lines = text.split('\n');
  for (let lineNum = 1; lineNum <= lines.length; lineNum++) {
    const line = lines[lineNum - 1];
    // Strip comments from this line
    const commentIdx = line.search(/(?<!\\)%/);
    const code = commentIdx >= 0 ? line.slice(0, commentIdx) : line;

    // Find \begin{...}
    const beginRegex = /\\begin\{([a-zA-Z0-9*_-]+)\}/g;
    let match: RegExpExecArray | null;
    while ((match = beginRegex.exec(code)) !== null) {
      envStack.push({ name: match[1], line: lineNum });
    }

    // Find \end{...}
    const endRegex = /\\end\{([a-zA-Z0-9*_-]+)\}/g;
    while ((match = endRegex.exec(code)) !== null) {
      const closingName = match[1];
      if (envStack.length === 0) {
        mismatches.push(`Unexpected \\end{${closingName}} at line ${lineNum} with no matching \\begin`);
      } else {
        const top = envStack.pop()!;
        if (top.name !== closingName) {
          mismatches.push(`Mismatched \\end{${closingName}} at line ${lineNum}, expected \\end{${top.name}} (opened at line ${top.line})`);
        }
      }
    }
  }

  return {
    balanced: envStack.length === 0 && mismatches.length === 0,
    unclosed: envStack.map(e => `${e.name} (opened line ${e.line})`),
    mismatches,
  };
}

/**
 * Extract external dependencies referenced in LaTeX source
 */
export function extractDependencies(source: string): LatexDocumentStructure['dependencies'] {
  const packages: string[] = [];
  const inputs: string[] = [];
  const figures: string[] = [];

  const lines = source.split('\n');
  for (const line of lines) {
    const commentIdx = line.search(/(?<!\\)%/);
    const code = commentIdx >= 0 ? line.slice(0, commentIdx) : line;

    // \usepackage[...]{pkg1,pkg2}
    const pkgMatch = /\\usepackage(?:\[[^\]]*\])?\{([^}]+)\}/g;
    let m: RegExpExecArray | null;
    while ((m = pkgMatch.exec(code)) !== null) {
      const pkgs = m[1].split(',').map(p => p.trim()).filter(Boolean);
      packages.push(...pkgs);
    }

    // \input{file} or \include{file}
    const inputMatch = /\\(?:input|include)\{([^}]+)\}/g;
    while ((m = inputMatch.exec(code)) !== null) {
      inputs.push(m[1].trim());
    }

    // \includegraphics[...]{path}
    const imgMatch = /\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/g;
    while ((m = imgMatch.exec(code)) !== null) {
      figures.push(m[1].trim());
    }
  }

  return {
    packages: Array.from(new Set(packages)),
    inputs: Array.from(new Set(inputs)),
    figures: Array.from(new Set(figures)),
  };
}

interface RawSectionHeaderMatch {
  index: number;
  headerText: string;
  title: string;
  type: 'command' | 'environment';
  envName?: string;
}

/**
 * Scan LaTeX source to locate section boundaries.
 * Recognizes \section, \section*, \subsection, \cvsection, \heading,
 * as well as environment-based sections like \begin{rSection}{Title}.
 */
export function parseLatexSections(source: string): LatexSection[] {
  const matches: RawSectionHeaderMatch[] = [];

  // Patterns for section headers across popular LaTeX resume classes (moderncv, altacv, jakes, resumesection, etc.):
  const headerRegex = /\\(?:(section|subsection|cvsection|cvsubsection|heading|subheading|resumesection|ressection|resheading|customsection|cvevent|roottitle|spacedallcaps|spacedlowsmallcaps|sectionline)\*?\s*\{|begin\{(rSection|resumeSection|cvsection|experiencesection|rubric)\}\s*\{)/g;
  let execRes: RegExpExecArray | null;

  while ((execRes = headerRegex.exec(source)) !== null) {
    const matchIndex = execRes.index;

    // Ensure this match is not in a LaTeX comment
    if (isPositionCommented(source, matchIndex)) {
      continue;
    }

    const fullMatch = execRes[0];
    const braceStartIndex = matchIndex + fullMatch.length - 1; // position of '{'
    const braceEndIndex = findMatchingBrace(source, braceStartIndex);

    if (braceEndIndex === -1) {
      // Unbalanced brace in header, skip to be safe
      continue;
    }

    const rawTitle = source.slice(braceStartIndex + 1, braceEndIndex);
    // Strip inner macros from title for display (e.g., \textbf{Experience} -> Experience)
    const displayTitle = rawTitle.replace(/\\[a-zA-Z]+(?:\*|\[[^\]]*\])?\{([^}]*)\}/g, '$1').trim();
    const headerText = source.slice(matchIndex, braceEndIndex + 1);

    const isEnv = Boolean(execRes[2]);
    matches.push({
      index: matchIndex,
      headerText,
      title: displayTitle || rawTitle.trim(),
      type: isEnv ? 'environment' : 'command',
      envName: execRes[2],
    });
  }

  // Fallback: If no macro-based sections were found, check bold standalone headers like \textbf{Experience}\hrule
  if (matches.length === 0) {
    const boldHeaderRegex = /\\(?:textbf|textsc|MakeUppercase|uppercase)\s*\{([A-Za-z\s]{3,35})\}(?:\s*\\(?:hrule|titlerule|hrulefill))?/g;
    let boldRes: RegExpExecArray | null;
    while ((boldRes = boldHeaderRegex.exec(source)) !== null) {
      const matchIndex = boldRes.index;
      if (isPositionCommented(source, matchIndex)) continue;
      const rawTitle = boldRes[1].trim();
      const cat = categorizeSectionTitle(rawTitle);
      if (cat !== 'other') {
        matches.push({
          index: matchIndex,
          headerText: boldRes[0],
          title: rawTitle,
          type: 'command',
        });
      }
    }
  }

  // Sort matches by position in document
  matches.sort((a, b) => a.index - b.index);

  if (matches.length === 0) {
    return [];
  }

  // Calculate lines for character offsets
  const lineStarts: number[] = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\n') lineStarts.push(i + 1);
  }

  function getLineNumber(charIndex: number): number {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (lineStarts[mid] <= charIndex) {
        if (mid === lineStarts.length - 1 || lineStarts[mid + 1] > charIndex) {
          return mid + 1;
        }
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return 1;
  }

  // Determine section boundaries
  const sections: LatexSection[] = [];
  const docEndIndex = source.indexOf('\\end{document}');
  const safeDocEnd = docEndIndex !== -1 ? docEndIndex : source.length;

  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const startIndex = cur.index;
    let endIndex = safeDocEnd;

    if (cur.type === 'environment' && cur.envName) {
      // Find matching \end{cur.envName}
      const endMarker = `\\end{${cur.envName}}`;
      const envEnd = source.indexOf(endMarker, startIndex);
      if (envEnd !== -1 && (i === matches.length - 1 || envEnd <= matches[i + 1].index)) {
        endIndex = envEnd + endMarker.length;
      } else if (i < matches.length - 1) {
        endIndex = matches[i + 1].index;
      }
    } else {
      // Command-based: extends until next section header or \end{document}
      if (i < matches.length - 1) {
        endIndex = matches[i + 1].index;
      }
    }

    const fullText = source.slice(startIndex, endIndex);
    const content = source.slice(startIndex + cur.headerText.length, endIndex);
    const startLine = getLineNumber(startIndex);
    const endLine = getLineNumber(Math.max(startIndex, endIndex - 1));

    const id = `${cur.title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${i + 1}`;
    const category = categorizeSectionTitle(cur.title);

    sections.push({
      id,
      title: cur.title,
      category,
      startLine,
      endLine,
      startIndex,
      endIndex,
      content,
      fullText,
      rawHeader: cur.headerText,
    });
  }

  return sections;
}

/**
 * Parse complete LaTeX document into structured AST
 */
export async function parseLatexDocument(source: string): Promise<LatexDocumentStructure> {
  const normalized = source.replace(/\r\n/g, '\n');
  const totalLines = normalized.split('\n').length;
  const sourceHash = await computeSourceHash(normalized);

  // Document class
  const classMatch = normalized.match(/\\documentclass(?:\[[^\]]*\])?\{([^}]+)\}/);
  const documentClass = classMatch ? classMatch[1].trim() : undefined;

  // Preamble: from start up to \begin{document}
  const beginDocIdx = normalized.indexOf('\\begin{document}');
  const preamble = beginDocIdx !== -1 ? normalized.slice(0, beginDocIdx) : '';

  const sections = parseLatexSections(normalized);
  const dependencies = extractDependencies(normalized);

  return {
    documentClass,
    preamble,
    sections,
    totalLines,
    sourceHash,
    dependencies,
  };
}
