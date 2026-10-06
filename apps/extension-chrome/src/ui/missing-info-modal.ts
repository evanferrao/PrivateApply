/**
 * Missing Information Questionnaire
 *
 * Prompts the user when a form asks for something not in their profile
 * (e.g., 10th-grade percentage, student ID, father's occupation, notice period in days).
 *
 * Allows the user to:
 * 1. Fill the field in the current application immediately
 * 2. Save the value to their profile / custom fields / question bank for future applications
 */

import { setHTML } from '../shared/html';
import type { FieldSchema } from '../shared/types';
import { chromeCompat } from '../shared/browser-compat';

export interface MissingFieldItem {
  field: FieldSchema;
  suggestedLabel: string;
  suggestedKey: string;
  category: 'custom_field' | 'question_bank' | 'india_pack' | 'family' | 'compensation' | 'education';
}

let activeDrawer: HTMLElement | null = null;

export function showMissingInfoQuestionnaire(
  unfilledFields: FieldSchema[],
  onFieldFilled: (selector: string, value: string) => void
): void {
  // Clean up any existing drawer
  hideMissingInfoQuestionnaire();

  // Filter fields: skip hidden, buttons, submit, file inputs
  const eligibleFields = unfilledFields.filter(f => {
    const t = (f.type || '').toLowerCase();
    const l = (f.label || f.name || f.id || '').trim();
    if (['hidden', 'submit', 'button', 'reset', 'file', 'image'].includes(t)) return false;
    if (!l || l.length < 2) return false;
    return true;
  });

  if (eligibleFields.length === 0) return;

  ensureStyles();

  activeDrawer = document.createElement('div');
  activeDrawer.id = 'privateapply-missing-info-drawer';

  const items: MissingFieldItem[] = eligibleFields.map(field => {
    const rawLabel = (field.label || field.name || field.id || 'Unknown Field').trim();
    const key = rawLabel
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

    let category: MissingFieldItem['category'] = 'custom_field';
    const lLower = rawLabel.toLowerCase();

    if (lLower.includes('father') || lLower.includes('mother') || lLower.includes('guardian') || lLower.includes('emergency')) {
      category = 'family';
    } else if (lLower.includes('10th') || lLower.includes('12th') || lLower.includes('backlog') || lLower.includes('roll') || lLower.includes('arrear') || lLower.includes('bond') || lLower.includes('ctc')) {
      category = 'india_pack';
    } else if (lLower.includes('why') || lLower.includes('describe') || lLower.includes('tell us') || lLower.includes('interest')) {
      category = 'question_bank';
    }

    return { field, suggestedLabel: rawLabel, suggestedKey: key, category };
  });

  const fieldsHtml = items
    .map(
      (item, idx) => `
    <div class="missing-field-row" data-idx="${idx}">
      <div class="missing-field-header">
        <label class="missing-field-label" for="missing-input-${idx}">
          ${escapeHtml(item.suggestedLabel)}
          ${item.field.required ? '<span class="req">*</span>' : ''}
        </label>
        <span class="missing-badge">${item.category.replace('_', ' ')}</span>
      </div>
      <div class="missing-input-group">
        <input
          type="${item.field.type === 'number' ? 'number' : 'text'}"
          id="missing-input-${idx}"
          class="missing-input"
          placeholder="Enter value to fill..."
        />
        <button type="button" class="btn-fill-single" data-idx="${idx}">Fill & Save</button>
      </div>
      <div class="missing-field-options">
        <label class="save-profile-checkbox">
          <input type="checkbox" id="missing-save-${idx}" checked />
          <span>Save to profile for future applications</span>
        </label>
      </div>
    </div>
  `
    )
    .join('');

  setHTML(
    activeDrawer,
    `
    <div class="missing-drawer-card">
      <div class="missing-drawer-top">
        <div class="missing-drawer-title-group">
          <div class="missing-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1e5e41" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
          </div>
          <div>
            <div class="missing-drawer-title">Missing Information Detected</div>
            <div class="missing-drawer-desc">${items.length} question${items.length > 1 ? 's' : ''} on this application need your input. Save them once to auto-fill everywhere.</div>
          </div>
        </div>
        <button type="button" class="missing-drawer-close" title="Close questionnaire">&times;</button>
      </div>

      <div class="missing-drawer-list">
        ${fieldsHtml}
      </div>

      <div class="missing-drawer-footer">
        <button type="button" class="btn-fill-all">Fill & Save All Answered</button>
        <button type="button" class="btn-dismiss-drawer">Dismiss</button>
      </div>
    </div>
  `
  );

  document.body.appendChild(activeDrawer);

  // Bind close buttons
  activeDrawer.querySelector('.missing-drawer-close')?.addEventListener('click', hideMissingInfoQuestionnaire);
  activeDrawer.querySelector('.btn-dismiss-drawer')?.addEventListener('click', hideMissingInfoQuestionnaire);

  // Bind single fills
  activeDrawer.querySelectorAll('.btn-fill-single').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt((btn as HTMLElement).dataset.idx!, 10);
      const item = items[idx];
      const input = activeDrawer?.querySelector(`#missing-input-${idx}`) as HTMLInputElement;
      const saveCheck = activeDrawer?.querySelector(`#missing-save-${idx}`) as HTMLInputElement;

      const val = input?.value?.trim();
      if (!val) {
        input?.focus();
        return;
      }

      // 1. Fill into the DOM field immediately
      onFieldFilled(item.field.selector, val);

      // 2. Save into profile if requested
      if (saveCheck?.checked) {
        await saveFieldToProfile(item, val);
      }

      // Mark row as completed
      const row = activeDrawer?.querySelector(`.missing-field-row[data-idx="${idx}"]`);
      if (row) {
        row.classList.add('completed');
        (btn as HTMLButtonElement).disabled = true;
        (btn as HTMLButtonElement).textContent = '✓ Saved';
      }
    });
  });

  // Bind Fill All
  activeDrawer.querySelector('.btn-fill-all')?.addEventListener('click', async () => {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const input = activeDrawer?.querySelector(`#missing-input-${i}`) as HTMLInputElement;
      const saveCheck = activeDrawer?.querySelector(`#missing-save-${i}`) as HTMLInputElement;
      const val = input?.value?.trim();
      if (val) {
        onFieldFilled(item.field.selector, val);
        if (saveCheck?.checked) {
          await saveFieldToProfile(item, val);
        }
        const row = activeDrawer?.querySelector(`.missing-field-row[data-idx="${i}"]`);
        row?.classList.add('completed');
      }
    }
    setTimeout(hideMissingInfoQuestionnaire, 600);
  });

  requestAnimationFrame(() => activeDrawer?.classList.add('open'));
}

export function hideMissingInfoQuestionnaire(): void {
  if (activeDrawer) {
    activeDrawer.classList.remove('open');
    setTimeout(() => {
      activeDrawer?.remove();
      activeDrawer = null;
    }, 250);
  }
}

async function saveFieldToProfile(item: MissingFieldItem, value: string): Promise<void> {
  try {
    await chromeCompat.runtime.sendMessage({
      kind: 'SAVE_MISSING_PROFILE_INFO',
      fieldKey: item.suggestedKey,
      label: item.suggestedLabel,
      value,
      category: item.category,
      aliases: [item.suggestedLabel.toLowerCase()],
    });
  } catch (err) {
    console.warn('[MissingInfo] Failed to save info to background:', err);
  }
}

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function ensureStyles(): void {
  if (document.getElementById('privateapply-missing-info-styles')) return;
  const style = document.createElement('style');
  style.id = 'privateapply-missing-info-styles';
  style.textContent = `
    #privateapply-missing-info-drawer {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2147483646;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      max-width: 440px;
      width: calc(100vw - 48px);
      transform: translateY(20px);
      opacity: 0;
      pointer-events: none;
      transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease;
    }
    #privateapply-missing-info-drawer.open {
      transform: translateY(0);
      opacity: 1;
      pointer-events: auto;
    }
    .missing-drawer-card {
      background: #ffffff;
      color: #0f172a;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      box-shadow: 0 16px 36px -4px rgba(0,0,0,0.18), 0 4px 12px rgba(0,0,0,0.08);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      max-height: 80vh;
    }
    .missing-drawer-top {
      padding: 16px 18px;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }
    .missing-drawer-title-group {
      display: flex;
      gap: 12px;
      align-items: flex-start;
    }
    .missing-icon {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: #e6f4ee;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .missing-drawer-title {
      font-size: 15px;
      font-weight: 600;
      color: #0f172a;
    }
    .missing-drawer-desc {
      font-size: 12px;
      color: #64748b;
      margin-top: 2px;
      line-height: 1.4;
    }
    .missing-drawer-close {
      background: none;
      border: none;
      font-size: 22px;
      color: #94a3b8;
      cursor: pointer;
      line-height: 1;
      padding: 0 4px;
    }
    .missing-drawer-close:hover { color: #0f172a; }
    .missing-drawer-list {
      padding: 14px 18px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .missing-field-row {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 10px 12px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      transition: background 0.2s;
    }
    .missing-field-row.completed {
      background: #f0fdf4;
      border-color: #bbf7d0;
      opacity: 0.85;
    }
    .missing-field-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .missing-field-label {
      font-size: 13px;
      font-weight: 500;
      color: #1e293b;
    }
    .missing-field-label .req { color: #e11d48; margin-left: 2px; }
    .missing-badge {
      font-size: 10px;
      text-transform: uppercase;
      font-weight: 600;
      background: #e2e8f0;
      color: #475569;
      padding: 2px 6px;
      border-radius: 4px;
      letter-spacing: 0.5px;
    }
    .missing-input-group {
      display: flex;
      gap: 8px;
    }
    .missing-input {
      flex: 1;
      font-size: 13px;
      padding: 7px 10px;
      border: 1px solid #e5e3dc;
      border-radius: 6px;
      outline: none;
      background: #ffffff;
      color: #18181b;
    }
    .missing-input:focus {
      border-color: #1e5e41;
      box-shadow: 0 0 0 2px rgba(30,94,65,0.15);
    }
    .btn-fill-single {
      background: #1e5e41;
      color: #ffffff;
      border: none;
      font-size: 12px;
      font-weight: 500;
      padding: 7px 12px;
      border-radius: 6px;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.15s;
    }
    .btn-fill-single:hover { background: #164932; }
    .missing-field-options {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: #57554f;
    }
    .save-profile-checkbox {
      display: flex;
      align-items: center;
      gap: 5px;
      cursor: pointer;
    }
    .missing-drawer-footer {
      padding: 12px 18px;
      background: #faf9f6;
      border-top: 1px solid #e5e3dc;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 10px;
    }
    .btn-fill-all {
      background: #18181b;
      color: #ffffff;
      border: none;
      font-size: 13px;
      font-weight: 500;
      padding: 8px 14px;
      border-radius: 7px;
      cursor: pointer;
      transition: background 0.15s;
    }
    .btn-fill-all:hover { background: #27272a; }
    .btn-dismiss-drawer {
      background: none;
      border: none;
      font-size: 13px;
      color: #57554f;
      cursor: pointer;
      padding: 8px 10px;
    }
    .btn-dismiss-drawer:hover { color: #18181b; }
  `;
  document.head.appendChild(style);
}
