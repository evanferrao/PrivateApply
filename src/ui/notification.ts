/**
 * Notification system - shows toast notifications to user
 * Brand: navy #0a0a0a + green #1a7f5a
 */

import { setHTML, escapeHtml } from '../shared/html';

type NotificationType = 'success' | 'error' | 'warning' | 'info';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  duration: number;
}

const activeNotifications = new Map<string, HTMLElement>();

/**
 * Show a notification toast
 */
export function showNotification(
  title: string,
  message: string,
  type: NotificationType = 'info',
  duration: number = 4000
): void {
  ensureStyles();

  const id = `notification_${Date.now()}`;

  // Create container if it doesn't exist
  let container = document.getElementById('privateapply-notifications-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'privateapply-notifications-container';
    Object.assign(container.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      zIndex: '2147483647',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      pointerEvents: 'none',
    });
    document.body.appendChild(container);
  }

  const { accent, iconSvg } = getTypeStyle(type);

  const el = document.createElement('div');
  el.id = id;
  el.className = 'privateapply-toast privateapply-toast-enter';
  el.setAttribute('data-type', type);
  el.style.cssText = `
    background: #e7ebe0;
    border-radius: 10px;
    box-shadow: 0 4px 20px rgba(29,31,20,0.12), 0 1px 4px rgba(29,31,20,0.06);
    padding: 14px 16px;
    min-width: 300px;
    max-width: 380px;
    pointer-events: auto;
    border: 1px solid #cfd6c2;
    border-left: 4px solid ${accent};
    font-family: 'Hind Vadodara', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    animation: privateapply-slide-in 0.25s cubic-bezier(0.16,1,0.3,1) forwards;
  `;

  setHTML(el, `
    <div style="display:flex;align-items:flex-start;gap:10px;">
      <div style="flex-shrink:0;margin-top:1px;">${iconSvg}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;font-size:13.5px;color:#1d1f14;line-height:1.3;margin-bottom:3px;">${escapeHtml(title)}</div>
        <div style="font-size:12px;color:#727a52;line-height:1.4;">${escapeHtml(message)}</div>
      </div>
      <button class="privateapply-toast-close"
        style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:16px;line-height:1;padding:0;width:18px;height:18px;flex-shrink:0;border-radius:4px;display:flex;align-items:center;justify-content:center;transition:background 0.15s,color 0.15s;"
        title="Dismiss"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/></svg>
      </button>
    </div>
  `);

  const closeBtn = el.querySelector('.privateapply-toast-close') as HTMLButtonElement | null;
  if (closeBtn) {
    closeBtn.addEventListener('mouseover', () => { closeBtn.style.background = '#f1f5f9'; closeBtn.style.color = '#334155'; });
    closeBtn.addEventListener('mouseout', () => { closeBtn.style.background = 'none'; closeBtn.style.color = '#94a3b8'; });
    closeBtn.addEventListener('click', () => removeNotification(id));
  }

  container.appendChild(el);
  activeNotifications.set(id, el);

  if (duration > 0) {
    setTimeout(() => removeNotification(id), duration);
  }
}

/**
 * Remove a notification with slide-out animation
 */
function removeNotification(id: string): void {
  const el = activeNotifications.get(id);
  if (!el) return;

  el.style.animation = 'privateapply-slide-out 0.2s ease forwards';
  setTimeout(() => {
    el.remove();
    activeNotifications.delete(id);
    const container = document.getElementById('privateapply-notifications-container');
    if (container && container.children.length === 0) container.remove();
  }, 200);
}

/**
 * Clear all notifications
 */
export function clearAllNotifications(): void {
  for (const id of activeNotifications.keys()) {
    removeNotification(id);
  }
}

/**
 * Brand-aligned colors + icons per type
 */
function getTypeStyle(type: NotificationType): { accent: string; iconSvg: string } {
  const styles = {
    success: {
      accent: '#707953',
      iconSvg: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="9" fill="#707953"/><path d="M5.5 9l2.5 2.5 4.5-4.5" stroke="#f3f5f0" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    },
    error: {
      accent: '#a84242',
      iconSvg: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="9" fill="#a84242"/><path d="M6 6l6 6M12 6l-6 6" stroke="#f3f5f0" stroke-width="1.6" stroke-linecap="round"/></svg>`,
    },
    warning: {
      accent: '#8c9867',
      iconSvg: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 1.5l7.5 14H1.5L9 1.5z" fill="#8c9867"/><path d="M9 7v3.5M9 12.5h.01" stroke="#f3f5f0" stroke-width="1.6" stroke-linecap="round"/></svg>`,
    },
    info: {
      accent: '#5e7953',
      iconSvg: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="9" fill="#5e7953"/><path d="M9 8.5v4M9 5.5h.01" stroke="#f3f5f0" stroke-width="1.6" stroke-linecap="round"/></svg>`,
    },
  };
  return styles[type];
}



/**
 * Inject keyframe animations once
 */
function ensureStyles(): void {
  if (document.getElementById('privateapply-notification-styles')) return;

  const style = document.createElement('style');
  style.id = 'privateapply-notification-styles';
  style.textContent = `
    @keyframes privateapply-slide-in {
      from { opacity: 0; transform: translateX(24px); }
      to   { opacity: 1; transform: translateX(0); }
    }
    @keyframes privateapply-slide-out {
      from { opacity: 1; transform: translateX(0); }
      to   { opacity: 0; transform: translateX(24px); }
    }
  `;
  document.head.appendChild(style);
}

// Initialise styles on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', ensureStyles);
} else {
  ensureStyles();
}

/** Convenience helpers */
export function showSuccess(title: string, message: string, duration?: number): void {
  showNotification(title, message, 'success', duration);
}
export function showError(title: string, message: string, duration?: number): void {
  showNotification(title, message, 'error', duration);
}
export function showWarning(title: string, message: string, duration?: number): void {
  showNotification(title, message, 'warning', duration);
}
export function showInfo(title: string, message: string, duration?: number): void {
  showNotification(title, message, 'info', duration);
}

/**
 * Show a sticky bottom-center beta warning banner for Workday pages.
 * Only shows once per browser session (keyed by sessionStorage).
 * @param logoUrl - URL to the Private Apply monogram icon (pass via browser.runtime.getURL)
 */
export function showWorkdayBetaBanner(logoUrl?: string): void {
  if (document.getElementById('privateapply-workday-beta-banner')) return;

  ensureStyles();
  ensureBetaBannerStyles();

  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" width="22" height="22" alt="Private Apply" style="border-radius:50%;flex-shrink:0;display:block;" />`
    : `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" style="flex-shrink:0;"><circle cx="11" cy="11" r="11" fill="#0a0a0a"/><text x="11" y="15.5" text-anchor="middle" font-size="11" font-weight="700" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" fill="#fff">O</text></svg>`;

  const banner = document.createElement('div');
  banner.id = 'privateapply-workday-beta-banner';
  setHTML(banner, `
    <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;">
      ${logoHtml}
      <div style="display:flex;flex-direction:column;gap:2px;min-width:0;">
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="font-size:12px;font-weight:700;color:#0a0a0a;letter-spacing:0.3px;line-height:1;">Private Apply</span>
          <span style="font-size:10px;font-weight:600;color:#fff;background:#f59e0b;border-radius:4px;padding:1px 5px;line-height:1.4;letter-spacing:0.4px;">BETA</span>
          <span style="font-size:11px;color:#64748b;font-weight:400;">· Workday</span>
        </div>
        <div style="font-size:12px;color:#475569;line-height:1.4;">
          Autofill on Workday is in early access — some fields may not fill correctly.
        </div>
      </div>
    </div>
    <button id="privateapply-workday-beta-dismiss"
      style="background:none;border:none;cursor:pointer;color:#94a3b8;padding:2px;margin-left:10px;flex-shrink:0;line-height:1;display:flex;align-items:center;justify-content:center;border-radius:4px;transition:background 0.15s,color 0.15s;"
      title="Dismiss"
      aria-label="Dismiss Workday beta notice"
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/></svg>
    </button>
  `);

  document.body.appendChild(banner);

  const dismiss = document.getElementById('privateapply-workday-beta-dismiss');
  if (dismiss) {
    dismiss.addEventListener('mouseover', () => {
      (dismiss as HTMLElement).style.background = '#f1f5f9';
      (dismiss as HTMLElement).style.color = '#334155';
    });
    dismiss.addEventListener('mouseout', () => {
      (dismiss as HTMLElement).style.background = 'none';
      (dismiss as HTMLElement).style.color = '#94a3b8';
    });
    dismiss.addEventListener('click', () => {
      banner.style.animation = 'privateapply-beta-banner-out 0.2s ease forwards';
      setTimeout(() => banner.remove(), 220);
    });
  }
}

function ensureBetaBannerStyles(): void {
  if (document.getElementById('privateapply-beta-banner-styles')) return;
  const style = document.createElement('style');
  style.id = 'privateapply-beta-banner-styles';
  style.textContent = `
    #privateapply-workday-beta-banner {
      position: fixed;
      bottom: 16px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 2147483646;
      display: flex;
      align-items: center;
      background: #e7ebe0;
      border: 1px solid #cfd6c2;
      border-left: 4px solid #707953;
      border-radius: 10px;
      padding: 10px 14px 10px 12px;
      max-width: 480px;
      width: max-content;
      box-shadow: 0 4px 20px rgba(29,31,20,0.12), 0 1px 4px rgba(29,31,20,0.06);
      font-family: 'Hind Vadodara', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      pointer-events: auto;
      animation:
        privateapply-beta-banner-in 0.3s cubic-bezier(0.16,1,0.3,1) forwards,
        privateapply-beta-banner-pulse 1.8s ease-out 0.4s 3;
    }
    @keyframes privateapply-beta-banner-in {
      from { opacity: 0; transform: translateX(-50%) translateY(12px); }
      to   { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
    @keyframes privateapply-beta-banner-pulse {
      0%   { box-shadow: 0 4px 20px rgba(30,41,59,0.12), 0 0 0 0   rgba(30,41,59,0.35); }
      60%  { box-shadow: 0 4px 20px rgba(30,41,59,0.12), 0 0 0 10px rgba(30,41,59,0); }
      100% { box-shadow: 0 4px 20px rgba(30,41,59,0.12), 0 0 0 0   rgba(30,41,59,0); }
    }
    @keyframes privateapply-beta-banner-out {
      from { opacity: 1; transform: translateX(-50%) translateY(0); }
      to   { opacity: 0; transform: translateX(-50%) translateY(12px); }
    }
  `;
  document.head.appendChild(style);
}
