/**
 * LaTeX Tailor Service
 * Orchestrates intelligent patch generation, non-fabricating prompt design,
 * anchor validation, and the compile-and-repair iterative feedback loop.
 */

import { aiClient } from './ai-client';
import { parseLatexDocument, computeSourceHash } from './latex-patch/latex-parser';
import { applyPatch, generateDiff, VersionManager } from './latex-patch/latex-patcher';
import { companionClient, CompileLatexResponse } from './companion-client';
import { LatexPatch, PatchApplyResult, DiffLine, SemanticChange } from './latex-patch/types';

export interface LatexTailorProgressCallback {
  (stage: 'analyzing' | 'patching' | 'validating' | 'compiling' | 'repairing' | 'complete' | 'error', message: string, progressPercent?: number): void;
}

export interface LatexTailorResult {
  success: boolean;
  finalSource: string;
  originalSource: string;
  sourceHash: string;
  diffLines: DiffLine[];
  semanticChanges: SemanticChange[];
  pdfBase64?: string;
  pdfSize?: number;
  engineUsed?: string;
  compileSuccess: boolean;
  compileDiagnostics?: CompileLatexResponse['diagnostics'];
  missingPackages?: string[];
  repairAttempts: number;
  error?: string;
}

/**
 * Robustly parse JSON from AI completion (strips markdown codeblocks and extracts JSON object)
 */
function extractPatchJson(raw: string): any {
  const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        // Fall through
      }
    }
  }
  return null;
}

/**
 * Build the AI prompt for structured LaTeX patch generation
 */
function buildPatchPrompt(
  sourceHash: string,
  sectionsOverview: string,
  sectionsToTailor: string,
  jobDescriptionOrInstructions: string
): string {
  return `You are an expert technical résumé editor and LaTeX specialist.
Tailor and enhance the candidate's LaTeX résumé to align with the provided target job description or user customization instructions.

GUIDELINES & INSTRUCTIONS:
1. ALIGNMENT & RELEVANCE: Emphasize genuine skills, technologies, and achievements relevant to the target role.
2. USER INSTRUCTIONS: If the target description contains explicit user requests (e.g. "add crypto, web3, blockchain, google summer of code open source"), incorporate those skills, technologies, and projects into the appropriate sections (Skills, Projects, or Experience) using clean LaTeX formatting (\\item, \\textbf, etc.).
3. FACTUAL INTEGRITY: Unless the user explicitly instructed adding specific skills/projects, do not fabricate new degrees or employers out of thin air.
4. DOCUMENT PRESERVATION: Preserve ALL LaTeX macros, environments (e.g. \\begin{itemize}, \\item, \\textbf), formatting, fonts, and layout.
5. PRECISE ANCHORS: You MUST provide an EXACT, distinctive multi-word substring "anchor" from the original source (such as an existing project line, specific bullet sentence, or header line). NEVER use generic repetitive tags like "\\begin{itemize}" or "\\end{itemize}" as an anchor.

---
TARGET JOB DESCRIPTION / USER INSTRUCTIONS:
${jobDescriptionOrInstructions}

---
RÉSUMÉ SECTIONS OVERVIEW:
${sectionsOverview}

---
SECTIONS TO TAILOR (Original Source):
${sectionsToTailor}

---
OUTPUT FORMAT:
Return ONLY a valid JSON object matching this exact schema (no markdown formatting, no explanations outside JSON):
{
  "version": 1,
  "source_hash": "${sourceHash}",
  "operations": [
    {
      "type": "replace",
      "target_section": "Experience",
      "anchor": "EXACT character-for-character copy of the original text/bullet to replace",
      "content": "Tailored replacement LaTeX text preserving \\item and macros",
      "reason": "Brief rationale for keyword emphasis"
    }
  ]
}
Supported operation types: "replace", "insert_after", "insert_before".`;
}

/**
 * Build the prompt for repairing a LaTeX compilation error
 */
function buildRepairPrompt(
  currentSourceSnippet: string,
  errorMessage: string,
  errorLine: number | null,
  sourceHash: string
): string {
  return `A LaTeX compilation error occurred when building the résumé.
Provide a minimal corrective patch to fix this compilation error.

ERROR MESSAGE: ${errorMessage}
ERROR LINE: ${errorLine ?? 'unknown'}

AFFECTED CODE REGION:
${currentSourceSnippet}

CRITICAL RULES:
1. Fix ONLY the syntax error, broken macro, or unescaped character causing the failure.
2. Do NOT rewrite the document or change factual content.
3. Provide an EXACT anchor from the affected code region.

Return ONLY a valid JSON object:
{
  "version": 1,
  "source_hash": "${sourceHash}",
  "operations": [
    {
      "type": "replace",
      "target_section": "affected",
      "anchor": "EXACT text containing the syntax error",
      "content": "Fixed LaTeX text",
      "reason": "Fix LaTeX compilation error"
    }
  ]
}`;
}

export class LatexTailorService {
  /**
   * Complete tailoring workflow: analyze -> patch -> compile -> (repair if needed)
   */
  async tailorAndCompile(
    originalTex: string,
    jobDescription: string,
    options?: {
      engine?: 'auto' | 'latexmk' | 'pdflatex' | 'xelatex' | 'lualatex';
      maxRepairAttempts?: number;
      onProgress?: LatexTailorProgressCallback;
    }
  ): Promise<LatexTailorResult> {
    const onProgress = options?.onProgress || (() => {});
    const maxRepairs = options?.maxRepairAttempts ?? 2;
    const engine = options?.engine || 'auto';

    onProgress('analyzing', 'Analyzing LaTeX document structure...', 10);
    const docStructure = await parseLatexDocument(originalTex);
    const sourceHash = docStructure.sourceHash;

    const versionManager = new VersionManager(originalTex, sourceHash);

    // 1. Identify sections to tailor (experience, projects, skills, summary, etc.)
    const targetCategories = new Set(['experience', 'projects', 'skills', 'summary', 'certifications', 'education']);
    let candidateSections = docStructure.sections.filter(s => targetCategories.has(s.category));

    // If no candidate sections matched standard categories, include all non-header sections
    if (candidateSections.length === 0) {
      candidateSections = docStructure.sections.filter(s => s.category !== 'header');
    }

    let sectionsOverview: string;
    let sectionsToTailor: string;

    if (candidateSections.length > 0) {
      sectionsOverview = candidateSections
        .map(s => `- ${s.title} (${s.category}, lines ${s.startLine}-${s.endLine})`)
        .join('\n');

      sectionsToTailor = candidateSections
        .map(s => `=== Section: ${s.title} ===\n${s.fullText}`)
        .join('\n\n');
    } else {
      // Graceful fallback to entire document body (between \begin{document} and \end{document}, or full text)
      const beginDoc = originalTex.indexOf('\\begin{document}');
      const endDoc = originalTex.indexOf('\\end{document}');
      const bodyText = (beginDoc !== -1 && endDoc !== -1 && endDoc > beginDoc)
        ? originalTex.slice(beginDoc, endDoc + '\\end{document}'.length)
        : originalTex;

      sectionsOverview = '- Entire Résumé Document Source';
      sectionsToTailor = `=== Document Source ===\n${bodyText}`;
    }

    // 2. Generate structured patch via AI
    onProgress('patching', 'Generating tailored bullet points and keyword alignment...', 30);
    const prompt = buildPatchPrompt(sourceHash, sectionsOverview, sectionsToTailor, jobDescription);

    let rawAiResponse: string;
    try {
      rawAiResponse = await aiClient.chat([
        { role: 'system', content: 'You are an expert LaTeX résumé editor. Return only valid JSON conforming to the patch schema.' },
        { role: 'user', content: prompt },
      ], { temperature: 0.2 });
    } catch (err) {
      onProgress('error', `AI Provider request failed: ${err instanceof Error ? err.message : String(err)}`);
      return {
        success: false,
        finalSource: originalTex,
        originalSource: originalTex,
        sourceHash,
        diffLines: [],
        semanticChanges: [],
        compileSuccess: false,
        repairAttempts: 0,
        error: `AI provider error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    const patchJson: LatexPatch = extractPatchJson(rawAiResponse);
    if (!patchJson || !Array.isArray(patchJson.operations)) {
      onProgress('error', 'AI response could not be parsed as a valid patch.');
      return {
        success: false,
        finalSource: originalTex,
        originalSource: originalTex,
        sourceHash,
        diffLines: [],
        semanticChanges: [],
        compileSuccess: false,
        repairAttempts: 0,
        error: 'AI generated invalid patch format.',
      };
    }

    // 3. Validate & apply patch
    onProgress('validating', 'Validating patch anchors and LaTeX brace balance...', 50);
    patchJson.source_hash = sourceHash; // Ensure source hash matches
    const applyResult: PatchApplyResult = await applyPatch(originalTex, patchJson);

    if (!applyResult.success) {
      const errorMsg = applyResult.validation.errors.map(e => e.message).join('; ');
      onProgress('error', `Patch validation failed: ${errorMsg}`);
      return {
        success: false,
        finalSource: originalTex,
        originalSource: originalTex,
        sourceHash,
        diffLines: [],
        semanticChanges: [],
        compileSuccess: false,
        repairAttempts: 0,
        error: `Patch failed validation: ${errorMsg}`,
      };
    }

    versionManager.addSnapshot({
      id: 'ai-proposed',
      label: 'AI Tailored',
      timestamp: Date.now(),
      source: applyResult.modifiedSource,
      hash: applyResult.sourceHash,
      isCompiled: false,
    });

    let currentSource = applyResult.modifiedSource;
    let diffLines = applyResult.diffLines;
    let semanticChanges = applyResult.semanticChanges;

    // 4. Compile via Linux native companion
    onProgress('compiling', 'Checking compilation with local TeX toolchain...', 70);
    const companionStatus = await companionClient.getStatus();

    if (!companionStatus.installed) {
      // Companion is not installed — gracefully return tailored source and diff with clear instructions
      onProgress('complete', 'Tailoring complete (Companion not installed; compilation skipped).', 100);
      return {
        success: true,
        finalSource: currentSource,
        originalSource: originalTex,
        sourceHash: applyResult.sourceHash,
        diffLines,
        semanticChanges,
        compileSuccess: false,
        repairAttempts: 0,
        error: 'Local compilation companion is not installed. Source has been tailored and is ready to copy or download.',
      };
    }

    if (!companionStatus.texInstalled) {
      onProgress('complete', 'Tailoring complete (TeX engines missing on host).', 100);
      return {
        success: true,
        finalSource: currentSource,
        originalSource: originalTex,
        sourceHash: applyResult.sourceHash,
        diffLines,
        semanticChanges,
        compileSuccess: false,
        repairAttempts: 0,
        error: 'Companion detected, but no TeX engines (latexmk, pdflatex) are installed on your Linux system.',
      };
    }

    // Attempt initial compilation
    let compileResp = await companionClient.compileLatex({
      source: currentSource,
      engine,
      timeoutSecs: 35,
    });

    let repairCount = 0;

    // 5. Compile-and-repair iterative validation loop
    while (!compileResp.success && repairCount < maxRepairs) {
      repairCount++;
      const primaryErr = compileResp.diagnostics?.errors?.[0];
      const errMsg = primaryErr?.message || compileResp.message || 'LaTeX compilation failed';
      const errLine = primaryErr?.line ?? null;

      // If missing LaTeX package detected (.sty / .cls), cannot auto-repair via source changes alone
      if (compileResp.diagnostics?.missingPackages && compileResp.diagnostics.missingPackages.length > 0) {
        break;
      }

      onProgress('repairing', `Attempting AI repair for LaTeX error (attempt ${repairCount}/${maxRepairs}): ${errMsg.slice(0, 80)}...`, 80);

      // Extract context around the error line
      const sourceLines = currentSource.split('\n');
      let snippet = currentSource;
      if (errLine && errLine > 0 && errLine <= sourceLines.length) {
        const start = Math.max(0, errLine - 5);
        const end = Math.min(sourceLines.length, errLine + 5);
        snippet = sourceLines.slice(start, end).join('\n');
      }

      const repairPrompt = buildRepairPrompt(snippet, errMsg, errLine, await computeSourceHash(currentSource));

      try {
        const repairAiRaw = await aiClient.chat([
          { role: 'system', content: 'You are a LaTeX repair expert. Return only valid JSON conforming to the patch schema.' },
          { role: 'user', content: repairPrompt },
        ], { temperature: 0.1 });

        const repairPatch: LatexPatch = extractPatchJson(repairAiRaw);
        if (repairPatch && Array.isArray(repairPatch.operations) && repairPatch.operations.length > 0) {
          repairPatch.source_hash = await computeSourceHash(currentSource);
          const repairResult = await applyPatch(currentSource, repairPatch);

          if (repairResult.success) {
            currentSource = repairResult.modifiedSource;
            diffLines = generateDiff(originalTex, currentSource);
            versionManager.addSnapshot({
              id: `repair-${repairCount}`,
              label: `Repair Attempt #${repairCount}`,
              timestamp: Date.now(),
              source: currentSource,
              hash: repairResult.sourceHash,
              isCompiled: false,
            });

            // Re-compile
            compileResp = await companionClient.compileLatex({
              source: currentSource,
              engine,
              timeoutSecs: 35,
            });
          }
        }
      } catch (e) {
        console.warn('[LatexTailorService] Repair attempt error:', e);
      }
    }

    if (compileResp.success) {
      onProgress('complete', 'Tailoring and PDF compilation completed successfully!', 100);
      versionManager.addSnapshot({
        id: 'compiled-success',
        label: 'Successfully Compiled',
        timestamp: Date.now(),
        source: currentSource,
        hash: await computeSourceHash(currentSource),
        isCompiled: true,
        pdfBase64: compileResp.pdfBase64,
      });

      return {
        success: true,
        finalSource: currentSource,
        originalSource: originalTex,
        sourceHash: await computeSourceHash(currentSource),
        diffLines,
        semanticChanges,
        pdfBase64: compileResp.pdfBase64,
        pdfSize: compileResp.pdfSize,
        engineUsed: compileResp.engineUsed,
        compileSuccess: true,
        compileDiagnostics: compileResp.diagnostics,
        repairAttempts: repairCount,
      };
    } else {
      // Compilation did not succeed after repairs
      onProgress('complete', 'Tailoring finished with compilation warnings/errors.', 100);
      return {
        success: true,
        finalSource: currentSource,
        originalSource: originalTex,
        sourceHash: await computeSourceHash(currentSource),
        diffLines,
        semanticChanges,
        compileSuccess: false,
        compileDiagnostics: compileResp.diagnostics,
        missingPackages: compileResp.diagnostics?.missingPackages,
        repairAttempts: repairCount,
        error: compileResp.message || 'Compilation failed after repair attempts.',
      };
    }
  }
}

export const latexTailorService = new LatexTailorService();
