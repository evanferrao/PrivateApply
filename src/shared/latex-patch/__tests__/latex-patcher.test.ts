import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseLatexSections,
  parseLatexDocument,
  checkBraceBalance,
  checkEnvironmentBalance,
  computeSourceHash,
  extractDependencies,
} from '../latex-parser';
import {
  validatePatch,
  applyPatch,
  generateDiff,
  VersionManager,
} from '../latex-patcher';
import { LatexPatch } from '../types';

const SAMPLE_RESUME_TEX = `\\documentclass[letterpaper,11pt]{article}
\\usepackage{latexsym}
\\usepackage[empty]{fullpage}
\\usepackage{titlesec}
\\usepackage{marvosym}
\\usepackage[usenames,dvipsnames]{color}
\\usepackage{verbatim}
\\usepackage{enumitem}
\\usepackage[hidelinks]{hyperref}
\\usepackage{fancyhdr}

% Fake comment that mentions \\section{Certifications} to test comment stripper

\\begin{document}

\\section{Education}
\\begin{itemize}
  \\item \\textbf{State University} \\hfill City, State\\\\
  Bachelor of Science in Computer Science \\hfill Aug 2018 -- May 2022
\\end{itemize}

\\section{Experience}
\\begin{itemize}
  \\item \\textbf{Software Engineer} -- Acme Corp \\hfill Jun 2022 -- Present
  \\begin{itemize}
    \\item Developed scalable microservices using TypeScript and Node.js.
    \\item Optimized PostgreSQL database queries, reducing p99 latency by 40\\%.
    \\item Collaborated with product team on weekly agile sprint planning.
  \\end{itemize}
\\end{itemize}

\\section{Projects}
\\begin{itemize}
  \\item \\textbf{Personal Portfolio}: Built a responsive portfolio site with Next.js and Tailwind.
  \\item \\textbf{Data Pipeline}: Automated telemetry processing with Python and Redis.
\\end{itemize}

\\section{Skills}
\\textbf{Languages}: JavaScript, TypeScript, Python, SQL, C++\\\\
\\textbf{Frameworks}: React, Node.js, Express, Next.js\\\\
\\textbf{Tools}: Docker, Git, Linux, PostgreSQL, Redis

\\end{document}
`;

describe('LaTeX Parser', () => {
  it('parses sections correctly and ignores section commands in comments', async () => {
    const doc = await parseLatexDocument(SAMPLE_RESUME_TEX);
    expect(doc.documentClass).toBe('article');
    expect(doc.sections.length).toBe(4);

    const titles = doc.sections.map(s => s.title);
    expect(titles).toEqual(['Education', 'Experience', 'Projects', 'Skills']);
    // The fake comment section was ignored
    expect(titles).not.toContain('Certifications');

    const categories = doc.sections.map(s => s.category);
    expect(categories).toEqual(['education', 'experience', 'projects', 'skills']);
  });

  it('extracts packages and dependencies accurately', () => {
    const deps = extractDependencies(SAMPLE_RESUME_TEX);
    expect(deps.packages).toContain('titlesec');
    expect(deps.packages).toContain('enumitem');
    expect(deps.packages).toContain('hyperref');
  });

  it('verifies balanced curly braces and ignores escaped braces', () => {
    expect(checkBraceBalance(SAMPLE_RESUME_TEX).balanced).toBe(true);

    const unbalanced = 'Some text { with open brace without closing.';
    expect(checkBraceBalance(unbalanced).balanced).toBe(false);

    const escaped = 'Valid with \\{ escaped \\} braces only.';
    expect(checkBraceBalance(escaped).balanced).toBe(true);
  });

  it('checks balanced environments', () => {
    expect(checkEnvironmentBalance(SAMPLE_RESUME_TEX).balanced).toBe(true);

    const brokenEnv = '\\begin{itemize}\\item Item 1\\end{enumerate}';
    const res = checkEnvironmentBalance(brokenEnv);
    expect(res.balanced).toBe(false);
    expect(res.mismatches?.length).toBeGreaterThan(0);
  });
});

describe('LaTeX Patcher', () => {
  let docHash: string;

  beforeEach(async () => {
    docHash = await computeSourceHash(SAMPLE_RESUME_TEX);
  });

  it('successfully applies a replace operation on an exact anchor', async () => {
    const patch: LatexPatch = {
      version: 1,
      source_hash: docHash,
      operations: [
        {
          type: 'replace',
          target_section: 'Experience',
          anchor: '\\item Developed scalable microservices using TypeScript and Node.js.',
          content: '\\item Engineered high-throughput distributed microservices in TypeScript, processing 50K req/s.',
          reason: 'Align with backend performance requirement',
        },
      ],
    };

    const res = await applyPatch(SAMPLE_RESUME_TEX, patch);
    expect(res.success).toBe(true);
    expect(res.modifiedSource).toContain('Engineered high-throughput distributed microservices');
    expect(res.modifiedSource).not.toContain('Developed scalable microservices using TypeScript and Node.js.');
    // Unrelated content remains pristine
    expect(res.modifiedSource).toContain('State University');
    expect(res.modifiedSource).toContain('Personal Portfolio');
  });

  it('successfully applies insert_after operation', async () => {
    const patch: LatexPatch = {
      version: 1,
      source_hash: docHash,
      operations: [
        {
          type: 'insert_after',
          target_section: 'Skills',
          anchor: '\\textbf{Tools}: Docker, Git, Linux, PostgreSQL, Redis',
          content: '\\\\ \\textbf{Cloud}: AWS (ECS, S3, RDS), CloudWatch',
          reason: 'Add cloud skills supported by candidate',
        },
      ],
    };

    const res = await applyPatch(SAMPLE_RESUME_TEX, patch);
    expect(res.success).toBe(true);
    expect(res.modifiedSource).toContain('\\textbf{Tools}: Docker, Git, Linux, PostgreSQL, Redis');
    expect(res.modifiedSource).toContain('\\\\ \\textbf{Cloud}: AWS (ECS, S3, RDS), CloudWatch');
  });

  it('successfully removes a specific targeted anchor', async () => {
    const patch: LatexPatch = {
      version: 1,
      source_hash: docHash,
      operations: [
        {
          type: 'remove',
          target_section: 'Projects',
          anchor: '  \\item \\textbf{Personal Portfolio}: Built a responsive portfolio site with Next.js and Tailwind.',
          reason: 'Trim less relevant frontend project for backend role',
        },
      ],
    };

    const res = await applyPatch(SAMPLE_RESUME_TEX, patch);
    expect(res.success).toBe(true);
    expect(res.modifiedSource).not.toContain('Personal Portfolio');
    expect(res.modifiedSource).toContain('Data Pipeline');
  });

  it('rejects patch when anchor does not match', async () => {
    const patch: LatexPatch = {
      version: 1,
      source_hash: docHash,
      operations: [
        {
          type: 'replace',
          target_section: 'Experience',
          anchor: '\\item Non-existent bullet that does not appear in source',
          content: '\\item Replaced bullet',
        },
      ],
    };

    const res = await applyPatch(SAMPLE_RESUME_TEX, patch);
    expect(res.success).toBe(false);
    expect(res.validation.errors[0].code).toBe('ANCHOR_NOT_FOUND');
    expect(res.modifiedSource).toBe(SAMPLE_RESUME_TEX.replace(/\r\n/g, '\n'));
  });

  it('rejects duplicate or ambiguous anchors', async () => {
    // "\\item " occurs multiple times in the document
    const patch: LatexPatch = {
      version: 1,
      source_hash: docHash,
      operations: [
        {
          type: 'replace',
          target_section: 'Experience',
          anchor: '    \\item ',
          content: '    \\item Modified: ',
        },
      ],
    };

    const res = await applyPatch(SAMPLE_RESUME_TEX, patch);
    expect(res.success).toBe(false);
    expect(res.validation.errors[0].code).toBe('ANCHOR_AMBIGUOUS');
  });

  it('rejects overlapping operations', async () => {
    const patch: LatexPatch = {
      version: 1,
      source_hash: docHash,
      operations: [
        {
          type: 'replace',
          target_section: 'Experience',
          anchor: 'Developed scalable microservices using TypeScript and Node.js.',
          content: 'Built fast microservices.',
        },
        {
          type: 'replace',
          target_section: 'Experience',
          anchor: 'scalable microservices',
          content: 'cloud services',
        },
      ],
    };

    const res = await applyPatch(SAMPLE_RESUME_TEX, patch);
    expect(res.success).toBe(false);
    expect(res.validation.errors.some(e => e.code === 'OVERLAPPING_OPERATIONS')).toBe(true);
  });

  it('rejects stale patches if source hash does not match', async () => {
    const patch: LatexPatch = {
      version: 1,
      source_hash: 'deadbeef00000000',
      operations: [
        {
          type: 'replace',
          target_section: 'Skills',
          anchor: '\\textbf{Tools}: Docker, Git, Linux, PostgreSQL, Redis',
          content: '\\textbf{Tools}: Docker, Git, Linux, PostgreSQL, Redis, Kubernetes',
        },
      ],
    };

    const res = await applyPatch(SAMPLE_RESUME_TEX, patch);
    expect(res.success).toBe(false);
    expect(res.validation.errors.some(e => e.code === 'HASH_MISMATCH')).toBe(true);
  });

  it('rejects invalid patch schema (version mismatch or empty ops)', async () => {
    const invalidPatch: any = {
      version: 99,
      operations: [],
    };

    const res = await applyPatch(SAMPLE_RESUME_TEX, invalidPatch);
    expect(res.success).toBe(false);
    expect(res.validation.errors.some(e => e.code === 'INVALID_SCHEMA')).toBe(true);
  });

  it('rolls back completely if a patch introduces unbalanced braces', async () => {
    const patch: LatexPatch = {
      version: 1,
      source_hash: docHash,
      operations: [
        {
          type: 'replace',
          target_section: 'Skills',
          anchor: '\\textbf{Tools}: Docker, Git, Linux, PostgreSQL, Redis',
          content: '\\textbf{Tools: Docker, Git, Linux, PostgreSQL, Redis', // Missing closing brace!
        },
      ],
    };

    const res = await applyPatch(SAMPLE_RESUME_TEX, patch);
    expect(res.success).toBe(false);
    expect(res.validation.errors.some(e => e.code === 'UNBALANCED_BRACES')).toBe(true);
    // Source was preserved unchanged
    expect(res.modifiedSource).toBe(SAMPLE_RESUME_TEX.replace(/\r\n/g, '\n'));
  });

  it('generates accurate unified diff and semantic summary', async () => {
    const patch: LatexPatch = {
      version: 1,
      source_hash: docHash,
      operations: [
        {
          type: 'replace',
          target_section: 'Experience',
          anchor: '    \\item Developed scalable microservices using TypeScript and Node.js.',
          content: '    \\item Architected event-driven microservices in TypeScript.',
          reason: 'Show architecture capabilities',
        },
      ],
    };

    const res = await applyPatch(SAMPLE_RESUME_TEX, patch);
    expect(res.success).toBe(true);
    expect(res.diffLines.some(d => d.type === 'removed' && d.content.includes('Developed scalable microservices'))).toBe(true);
    expect(res.diffLines.some(d => d.type === 'added' && d.content.includes('Architected event-driven microservices'))).toBe(true);
    expect(res.semanticChanges[0].type).toBe('bullet_modified');
    expect(res.semanticChanges[0].reason).toBe('Show architecture capabilities');
  });

  it('VersionManager tracks snapshots and supports rollback', () => {
    const vm = new VersionManager('v1 source', 'hash1');
    expect(vm.getCurrentSnapshot()?.source).toBe('v1 source');
    expect(vm.canRollback()).toBe(false);

    vm.addSnapshot({
      id: 'proposed',
      label: 'Proposed Patch',
      timestamp: Date.now(),
      source: 'v2 source',
      hash: 'hash2',
      isCompiled: false,
    });

    expect(vm.getCurrentSnapshot()?.source).toBe('v2 source');
    expect(vm.canRollback()).toBe(true);

    const rolledBack = vm.rollback();
    expect(rolledBack?.source).toBe('v1 source');
    expect(vm.getCurrentSnapshot()?.source).toBe('v1 source');
  });
});
