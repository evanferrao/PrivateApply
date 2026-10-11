import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../browser-compat', () => ({
  default: {
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
      },
    },
    runtime: {
      sendMessage: vi.fn(),
      connectNative: vi.fn(),
      lastError: null,
    },
  },
  chromeCompat: {},
}));

import { latexTailorService } from '../latex-tailor-service';
import { aiClient } from '../ai-client';
import { companionClient } from '../companion-client';
import { computeSourceHash } from '../latex-patch/latex-parser';

const TEST_TEX = `\\documentclass{article}
\\begin{document}
\\section{Experience}
\\begin{itemize}
  \\item Built web applications using React.
  \\item Maintained SQL databases.
\\end{itemize}
\\end{document}
`;

describe('LatexTailorService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('runs the full tailoring and compile flow when companion succeeds', async () => {
    const hash = await computeSourceHash(TEST_TEX);

    const mockPatch = {
      version: 1,
      source_hash: hash,
      operations: [
        {
          type: 'replace',
          target_section: 'Experience',
          anchor: '\\item Built web applications using React.',
          content: '\\item Architected responsive web applications using React and TypeScript.',
          reason: 'Align with React/TypeScript job requirements',
        },
      ],
    };

    vi.spyOn(aiClient, 'chat').mockResolvedValue(JSON.stringify(mockPatch));
    vi.spyOn(companionClient, 'getStatus').mockResolvedValue({
      installed: true,
      texInstalled: true,
      platform: 'linux',
      version: '1.0.0',
    });
    vi.spyOn(companionClient, 'compileLatex').mockResolvedValue({
      ok: true,
      success: true,
      engineUsed: 'pdflatex',
      pdfBase64: 'JVBERi0xLjQKJcfs...',
      pdfSize: 1024,
      diagnostics: { errors: [], warnings: [], missingPackages: [] },
    });

    const progressLogs: string[] = [];
    const result = await latexTailorService.tailorAndCompile(
      TEST_TEX,
      'Seeking React and TypeScript developer with frontend architecture experience.',
      {
        onProgress: (stage, msg) => progressLogs.push(`${stage}: ${msg}`),
      }
    );

    expect(result.success).toBe(true);
    expect(result.compileSuccess).toBe(true);
    expect(result.finalSource).toContain('Architected responsive web applications using React and TypeScript.');
    expect(result.pdfBase64).toBe('JVBERi0xLjQKJcfs...');
    expect(progressLogs.some(l => l.startsWith('analyzing:'))).toBe(true);
    expect(progressLogs.some(l => l.startsWith('compiling:'))).toBe(true);
  });

  it('gracefully handles missing companion without losing tailored source', async () => {
    const hash = await computeSourceHash(TEST_TEX);

    const mockPatch = {
      version: 1,
      source_hash: hash,
      operations: [
        {
          type: 'replace',
          target_section: 'Experience',
          anchor: '\\item Maintained SQL databases.',
          content: '\\item Administered PostgreSQL databases and optimized indexing.',
        },
      ],
    };

    vi.spyOn(aiClient, 'chat').mockResolvedValue(JSON.stringify(mockPatch));
    vi.spyOn(companionClient, 'getStatus').mockResolvedValue({
      installed: false,
    });

    const result = await latexTailorService.tailorAndCompile(
      TEST_TEX,
      'Looking for PostgreSQL database administrator.',
    );

    expect(result.success).toBe(true);
    expect(result.compileSuccess).toBe(false);
    expect(result.finalSource).toContain('Administered PostgreSQL databases');
    expect(result.error).toContain('companion is not installed');
  });

  it('triggers compile-and-repair loop on compilation failure', async () => {
    const hash = await computeSourceHash(TEST_TEX);

    // Initial patch has broken macro
    const mockPatch1 = {
      version: 1,
      source_hash: hash,
      operations: [
        {
          type: 'replace',
          target_section: 'Experience',
          anchor: '\\item Built web applications using React.',
          content: '\\item Built web applications with \\badMacro.',
        },
      ],
    };

    // Corrective patch fixes the macro
    const mockRepairPatch = {
      version: 1,
      source_hash: hash,
      operations: [
        {
          type: 'replace',
          target_section: 'Experience',
          anchor: '\\item Built web applications with \\badMacro.',
          content: '\\item Built web applications with React.',
          reason: 'Remove undefined macro',
        },
      ],
    };

    const aiSpy = vi.spyOn(aiClient, 'chat')
      .mockResolvedValueOnce(JSON.stringify(mockPatch1))
      .mockResolvedValueOnce(JSON.stringify(mockRepairPatch));

    vi.spyOn(companionClient, 'getStatus').mockResolvedValue({
      installed: true,
      texInstalled: true,
      platform: 'linux',
    });

    const compileSpy = vi.spyOn(companionClient, 'compileLatex')
      .mockResolvedValueOnce({
        ok: false,
        success: false,
        message: 'Undefined control sequence \\badMacro',
        diagnostics: {
          errors: [{ message: 'Undefined control sequence \\badMacro', line: 4 }],
          warnings: [],
          missingPackages: [],
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        success: true,
        pdfBase64: 'JVBERi0xLjQK...',
        pdfSize: 500,
        diagnostics: { errors: [], warnings: [], missingPackages: [] },
      });

    const result = await latexTailorService.tailorAndCompile(
      TEST_TEX,
      'React developer needed',
      { maxRepairAttempts: 2 }
    );

    expect(result.success).toBe(true);
    expect(result.compileSuccess).toBe(true);
    expect(result.repairAttempts).toBe(1);
    expect(compileSpy).toHaveBeenCalledTimes(2);
  });
});
