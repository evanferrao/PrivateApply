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

      if (bgResp && typeof bgResp === 'object' && 'installed' in bgResp) {
        return bgResp as CompanionStatus;
      }

      // Direct fallback via runtime.connectNative / sendNativeMessage
      return await this.sendDirectNativeMessage({ cmd: 'get_status' });
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

      if (bgResp && typeof bgResp === 'object' && ('success' in bgResp || 'ok' in bgResp)) {
        return bgResp as CompileLatexResponse;
      }

      // Direct fallback
      return await this.sendDirectNativeMessage({
        cmd: 'compile_latex',
        source: request.source,
        engine: request.engine || 'auto',
        assets: request.assets || {},
        timeout_secs: request.timeoutSecs || 30,
      });
    } catch (err) {
      return {
        ok: false,
        success: false,
        errorType: 'CLIENT_ERROR',
        message: err instanceof Error ? err.message : 'Compilation request failed',
      };
    }
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
