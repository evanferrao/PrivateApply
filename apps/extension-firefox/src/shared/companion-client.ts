/**
 * PrivateApply Companion Client
 * Bridges the browser extension to the local Linux Native Messaging companion (com.privateapply.companion).
 * Handles detection, status queries, safe compilation requests, and error diagnostics.
 */

import browser from './browser-compat';

export const COMPANION_HOST_ID = 'com.privateapply.companion';

export interface EngineInfo {
  available: boolean;
  path: string | null;
  version: string | null;
}

export interface CompanionStatus {
  installed: boolean;
  version?: string;
  platform?: string;
  texInstalled?: boolean;
  engines?: Record<string, EngineInfo>;
  error?: string;
}

export interface CompileDiagnostic {
  message: string;
  line?: number | null;
  context?: string | null;
}

export interface CompileLatexRequest {
  source: string;
  engine?: 'auto' | 'latexmk' | 'pdflatex' | 'xelatex' | 'lualatex';
  assets?: Record<string, string>; // filename -> base64 string
  timeoutSecs?: number;
}

export interface CompileLatexResponse {
  ok: boolean;
  success: boolean;
  exitCode?: number;
  durationMs?: number;
  engineUsed?: string;
  pdfBase64?: string;
  pdfSize?: number;
  artifactPath?: string;
  artifactName?: string;
  diagnostics?: {
    errors: CompileDiagnostic[];
    warnings: string[];
    missingPackages: string[];
    logExcerpt?: string;
  };
  errorType?: string;
  message?: string;
  error?: string;
}

export class CompanionClient {
  private hostId: string;

  constructor(hostId: string = COMPANION_HOST_ID) {
    this.hostId = hostId;
  }

  /**
   * Check if the Native Messaging host is installed and get TeX engine details
   */
  async getStatus(): Promise<CompanionStatus> {
    try {
      // First attempt via background runtime message (standardized relay)
      const bgResp = await browser.runtime.sendMessage({
        kind: 'COMPANION_GET_STATUS',
      }).catch(() => null);

      if (bgResp && typeof bgResp === 'object' && ('installed' in bgResp || 'ok' in bgResp)) {
        return {
          installed: Boolean(bgResp.installed ?? bgResp.ok),
          version: bgResp.version,
          platform: bgResp.platform,
          texInstalled: bgResp.texInstalled ?? bgResp.tex_installed,
          engines: bgResp.engines,
          error: bgResp.error,
        };
      }

      // Direct fallback via runtime.connectNative / sendNativeMessage
      const direct = await this.sendDirectNativeMessage({ cmd: 'get_status' });
      return {
        installed: Boolean(direct?.installed ?? direct?.ok),
        version: direct?.version,
        platform: direct?.platform,
        texInstalled: direct?.texInstalled ?? direct?.tex_installed,
        engines: direct?.engines,
        error: direct?.error,
      };
    } catch (err) {
      return {
        installed: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Send LaTeX source to the companion for isolated compilation
   */
  async compileLatex(request: CompileLatexRequest): Promise<CompileLatexResponse> {
    try {
      const bgResp = await browser.runtime.sendMessage({
        kind: 'COMPANION_COMPILE_LATEX',
        payload: {
          cmd: 'compile_latex',
          source: request.source,
          engine: request.engine || 'auto',
          assets: request.assets || {},
          timeout_secs: request.timeoutSecs || 30,
        },
      }).catch(() => null);

      const raw = (bgResp && typeof bgResp === 'object' && ('success' in bgResp || 'ok' in bgResp))
        ? bgResp
        : await this.sendDirectNativeMessage({
            cmd: 'compile_latex',
            source: request.source,
            engine: request.engine || 'auto',
            assets: request.assets || {},
            timeout_secs: request.timeoutSecs || 30,
          });

      return this.normalizeCompileResponse(raw);
    } catch (err) {
      return {
        ok: false,
        success: false,
        errorType: 'CLIENT_ERROR',
        message: err instanceof Error ? err.message : 'Compilation request failed',
      };
    }
  }

  private normalizeCompileResponse(raw: any): CompileLatexResponse {
    if (!raw || typeof raw !== 'object') {
      return {
        ok: false,
        success: false,
        errorType: 'EMPTY_RESPONSE',
        message: 'Empty or invalid response from companion host',
      };
    }

    const success = Boolean(raw.success || raw.ok);
    const pdfBase64 = raw.pdfBase64 || raw.pdf_base64 || undefined;
    const pdfSize = raw.pdfSize ?? raw.pdf_size ?? (pdfBase64 ? Math.round(pdfBase64.length * 0.75) : 0);
    const exitCode = raw.exitCode ?? raw.exit_code ?? (success ? 0 : 1);
    const durationMs = raw.durationMs ?? raw.duration_ms ?? 0;
    const engineUsed = raw.engineUsed || raw.engine_used || 'auto';

    let diagnostics = raw.diagnostics;
    if (diagnostics && typeof diagnostics === 'object') {
      diagnostics = {
        errors: diagnostics.errors || [],
        warnings: diagnostics.warnings || [],
        missingPackages: diagnostics.missingPackages || diagnostics.missing_packages || [],
        logExcerpt: diagnostics.logExcerpt || diagnostics.log_excerpt || '',
      };
    } else {
      diagnostics = { errors: [], warnings: [], missingPackages: [] };
    }

    return {
      ok: success,
      success,
      pdfBase64,
      pdfSize,
      exitCode,
      durationMs,
      engineUsed,
      diagnostics,
      errorType: raw.errorType || raw.error_type,
      message: raw.message,
    };
  }

  /**
   * Send single message to native host via connectNative with 15s timeout
   */
  private sendDirectNativeMessage(msg: Record<string, unknown>): Promise<any> {
    return new Promise((resolve) => {
      let resolved = false;
      const done = (res: any) => {
        if (!resolved) {
          resolved = true;
          resolve(res);
        }
      };

      const timeout = setTimeout(() => {
        done({
          installed: false,
          ok: false,
          error: 'Native companion timed out after 35 seconds',
        });
      }, 35000);

      try {
        if (!browser.runtime.connectNative) {
          clearTimeout(timeout);
          done({
            installed: false,
            ok: false,
            error: 'Native messaging is not supported in this context',
          });
          return;
        }

        const port = browser.runtime.connectNative(this.hostId);

        port.onMessage.addListener((res: any) => {
          clearTimeout(timeout);
          if (msg.cmd === 'get_status') {
            done({
              installed: Boolean(res.ok),
              version: res.version,
              platform: res.platform,
              texInstalled: res.tex_installed,
              engines: res.engines,
            });
          } else {
            done(res);
          }
          try { port.disconnect(); } catch {}
        });

        port.onDisconnect.addListener(() => {
          clearTimeout(timeout);
          const err = (browser.runtime.lastError as any)?.message || 'Companion disconnected';
          done({
            installed: false,
            ok: false,
            error: err,
          });
        });

        port.postMessage(msg);
      } catch (e) {
        clearTimeout(timeout);
        done({
          installed: false,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    });
  }
}

export const companionClient = new CompanionClient();
