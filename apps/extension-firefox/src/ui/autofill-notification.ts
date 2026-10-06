/**
 * Gentle Autofill Notification - shown when fields are detected on a page
 * Brand: navy #0a0a0a + green #1a7f5a
 */

import { setHTML } from '../shared/html';

let notification: HTMLElement | null = null;
let autoHideTimeout: number | null = null;

export function showAutofillNotification(fieldCount: number): void {
  hideAutofillNotification();
  ensureStyles();

  notification = document.createElement('div');
  notification.id = 'privateapply-autofill-notification';
  setHTML(notification, `
    <div class="privateapply-notif-content">
      <div class="privateapply-notif-icon">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <circle cx="9" cy="9" r="9" fill="#1e5e41"/>
          <path d="M5.5 9l2.5 2.5 4.5-4.5" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="privateapply-notif-text">
        <div class="privateapply-notif-title">Autofill Ready</div>
        <div class="privateapply-notif-subtitle">${fieldCount} field${fieldCount !== 1 ? 's' : ''} detected on this page</div>
      </div>
      <button class="privateapply-notif-close" title="Dismiss">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/></svg>
      </button>
    </div>
  `);

  document.body.appendChild(notification);

  const closeBtn = notification.querySelector('.privateapply-notif-close');
  if (closeBtn) closeBtn.addEventListener('click', hideAutofillNotification);

  autoHideTimeout = window.setTimeout(hideAutofillNotification, 5000);

  requestAnimationFrame(() => notification?.classList.add('show'));
}

let shoppingNotification: HTMLElement | null = null;
let shoppingAutoHideTimeout: number | null = null;

/** Friendly amber notification shown on checkout/shopping pages where Private Apply helps with name+address only */
export function showShoppingHelperNotification(): void {
  if (shoppingNotification) return; // Already shown
  ensureStyles();
  ensureShoppingStyles();

  shoppingNotification = document.createElement('div');
  shoppingNotification.id = 'privateapply-shopping-notification';
  setHTML(shoppingNotification, `
    <div class="privateapply-shop-notif-content">
      <div class="privateapply-shop-notif-icon">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <circle cx="9" cy="9" r="9" fill="#d97706"/>
          <path d="M9 5v4l2.5 2.5" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="privateapply-notif-text">
        <div class="privateapply-notif-title">Private Apply can help with this too</div>
        <div class="privateapply-notif-subtitle">Filling your name and address</div>
      </div>
      <button class="privateapply-notif-close privateapply-shop-close" title="Dismiss">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/></svg>
      </button>
    </div>
  `);

  document.body.appendChild(shoppingNotification);

  const closeBtn = shoppingNotification.querySelector('.privateapply-shop-close');
  if (closeBtn) closeBtn.addEventListener('click', hideShoppingHelperNotification);

  shoppingAutoHideTimeout = window.setTimeout(hideShoppingHelperNotification, 4000);

  requestAnimationFrame(() => shoppingNotification?.classList.add('show'));
}

export function hideShoppingHelperNotification(): void {
  if (shoppingAutoHideTimeout) {
    clearTimeout(shoppingAutoHideTimeout);
    shoppingAutoHideTimeout = null;
  }
  if (shoppingNotification) {
    shoppingNotification.classList.remove('show');
    setTimeout(() => { shoppingNotification?.remove(); shoppingNotification = null; }, 250);
  }
}

export function hideAutofillNotification(): void {
  if (autoHideTimeout) {
    clearTimeout(autoHideTimeout);
    autoHideTimeout = null;
  }
  if (notification) {
    notification.classList.remove('show');
    setTimeout(() => { notification?.remove(); notification = null; }, 250);
  }
}

function ensureShoppingStyles(): void {
  if (document.getElementById('privateapply-shopping-notification-styles')) return;
  const style = document.createElement('style');
  style.id = 'privateapply-shopping-notification-styles';
  style.textContent = `
    #privateapply-shopping-notification {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      opacity: 0;
      transform: translateX(24px);
      transition: opacity 0.3s ease, transform 0.3s cubic-bezier(0.16,1,0.3,1);
      pointer-events: none;
    }
    #privateapply-shopping-notification.show {
      opacity: 1;
      transform: translateX(0);
      pointer-events: auto;
    }
    .privateapply-shop-notif-content {
      background: #fff;
      border-radius: 10px;
      box-shadow: 0 4px 20px rgba(30,41,59,0.14), 0 1px 4px rgba(30,41,59,0.08);
      padding: 14px 16px;
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 280px;
      max-width: 360px;
      border-left: 4px solid #d97706;
    }
    .privateapply-shop-notif-icon {
      flex-shrink: 0;
      display: flex;
      align-items: center;
    }
  `;
  document.head.appendChild(style);
}

function ensureStyles(): void {
  if (document.getElementById('privateapply-autofill-notification-styles')) return;

  const style = document.createElement('style');
  style.id = 'privateapply-autofill-notification-styles';
  style.textContent = `
    @keyframes privateapply-notif-pulse {
      0%   { box-shadow: 0 4px 20px rgba(30,41,59,0.14), 0 0 0 0 rgba(22,163,74,0.45); }
      50%  { box-shadow: 0 4px 20px rgba(30,41,59,0.14), 0 0 0 7px rgba(22,163,74,0); }
      100% { box-shadow: 0 4px 20px rgba(30,41,59,0.14), 0 0 0 0 rgba(22,163,74,0); }
    }

    #privateapply-autofill-notification {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      opacity: 0;
      transform: translateX(24px);
      transition: opacity 0.3s ease, transform 0.3s cubic-bezier(0.16,1,0.3,1);
      pointer-events: none;
    }
    #privateapply-autofill-notification.show {
      opacity: 1;
      transform: translateX(0);
      pointer-events: auto;
    }
    .privateapply-notif-content {
      background: #fff;
      border-radius: 10px;
      box-shadow: 0 4px 20px rgba(30,41,59,0.14), 0 1px 4px rgba(30,41,59,0.08);
      padding: 14px 16px;
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 280px;
      max-width: 360px;
      border-left: 4px solid #1e5e41;
      animation: privateapply-notif-pulse 2s ease-out 0.35s 3;
    }
    .privateapply-notif-icon {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      position: relative;
    }
    /* Pulsing ring behind the icon */
    .privateapply-notif-icon::after {
      content: '';
      position: absolute;
      inset: -4px;
      border-radius: 50%;
      background: rgba(22,163,74,0.18);
      animation: privateapply-notif-pulse 2s ease-out 0.35s 3;
    }
    .privateapply-notif-text { flex: 1; min-width: 0; }
    .privateapply-notif-title {
      font-weight: 600;
      font-size: 13px;
      color: #0a0a0a;
      line-height: 1.3;
      margin-bottom: 2px;
    }
    .privateapply-notif-subtitle {
      font-size: 12px;
      color: #64748b;
      line-height: 1.4;
    }
    .privateapply-notif-close {
      background: none;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      padding: 0;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      flex-shrink: 0;
      transition: background 0.15s, color 0.15s;
    }
    .privateapply-notif-close:hover {
      background: #f1f5f9;
      color: #334155;
    }
  `;
  document.head.appendChild(style);
}
