import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSendMessage = vi.fn();
const mockConnectNative = vi.fn();

vi.mock('../browser-compat', () => ({
  default: {
    runtime: {
      sendMessage: (...args: any[]) => mockSendMessage(...args),
      connectNative: (...args: any[]) => mockConnectNative(...args),
      lastError: null,
    },
  },
}));

import { companionClient } from '../companion-client';

describe('CompanionClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queries companion status via background message', async () => {
    mockSendMessage.mockResolvedValueOnce({
      installed: true,
      version: '1.0.0',
      platform: 'linux',
      texInstalled: true,
      engines: {
        latexmk: { available: true, path: '/usr/bin/latexmk', version: '4.88' },
        pdflatex: { available: true, path: '/usr/bin/pdflatex', version: '3.14' },
      },
    });

    const status = await companionClient.getStatus();
    expect(status.installed).toBe(true);
    expect(status.version).toBe('1.0.0');
    expect(status.texInstalled).toBe(true);
    expect(mockSendMessage).toHaveBeenCalledWith({
      kind: 'COMPANION_GET_STATUS',
    });
  });

  it('handles companion compilation request', async () => {
    mockSendMessage.mockResolvedValueOnce({
      ok: true,
      success: true,
      engineUsed: 'latexmk',
      pdfBase64: 'JVBERi0xLjQK...',
      pdfSize: 2048,
      durationMs: 450,
    });

    const resp = await companionClient.compileLatex({
      source: '\\documentclass{article}\\begin{document}Hello\\end{document}',
      engine: 'latexmk',
    });

    expect(resp.success).toBe(true);
    expect(resp.pdfBase64).toBe('JVBERi0xLjQK...');
    expect(resp.durationMs).toBe(450);
  });

  it('reports error when companion is unreachable', async () => {
    mockSendMessage.mockRejectedValueOnce(new Error('Host not found'));

    // Direct connectNative fallback will fail if no connectNative response
    const status = await companionClient.getStatus();
    expect(status.installed).toBe(false);
  });
});
