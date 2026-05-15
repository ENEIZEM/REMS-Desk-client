/* ═══════════════════════════════════════════════════════════════
   REMS — Media-attach helper
   ───────────────────────────────────────────────────────────────
   Reusable "pick → preview → confirm → upload" pipeline shared by
   the avatar and the org-logo widgets. Anywhere else we need image
   attachment with the same UX (preview before commit, replace, error
   surfacing) we just wire wireMediaAttach() with a tiny config.

   Usage:
       import { wireMediaAttach } from '../media-attach.js';

       wireMediaAttach({
         input:       '#avatar-input',
         trigger:     '#btn-change-avatar',
         entityType:  'user',
         confirm:     mediaFileId => profile.confirmAvatar(mediaFileId),
         onSuccess:   () => loadProfile(),
         titleKey:    'profile.media_avatar_title',
         hintKey:     'profile.media_avatar_hint',
         cropPreview: 'circle',                 // 'circle' | 'square' | false
         t, toast, errorMessage,
       });

   cropPreview overlay (optional):
       • 'circle' — dims everything outside the inscribed circle.
       • 'square' — dims everything outside the centred square.
       • false / omitted — no overlay (full image is used as-is).

   The picker preview lives in a SHARED modal (`#media-preview-modal`)
   injected once on first wire-up; each widget round-robins through it
   via the _activeController module reference set by showPreview().
   ═══════════════════════════════════════════════════════════════ */

import { media } from './api.js';

function q(sel) { return document.querySelector(sel); }

// Inject the shared preview modal exactly once.
let _modalInjected = false;
function ensureModal(t) {
  if (_modalInjected) return;
  _modalInjected = true;

  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.id = 'media-preview-modal';
  modal.innerHTML = `
    <div class="modal" style="max-width:560px;">
      <div class="modal-header">
        <h3 class="modal-title" id="media-preview-title">${t('profile.media_preview_title') || 'Предпросмотр'}</h3>
        <button class="modal-close" data-close-modal="media-preview-modal"><i class="ph ph-x"></i></button>
      </div>
      <div class="modal-body" style="text-align:center;">
        <p id="media-preview-hint" class="form-hint" style="margin-bottom:.85rem;"></p>
        <div id="media-preview-frame" class="media-preview-frame">
          <img id="media-preview-image" alt="">
          <div id="media-preview-overlay" class="media-crop-overlay" style="display:none;"></div>
        </div>
        <p id="media-preview-meta" style="margin-top:.6rem; font-size:var(--text-xs); color:var(--clr-text-muted);"></p>
        <div class="alert alert-error" id="media-preview-error"><i class="ph ph-warning-circle"></i><span id="media-preview-error-text"></span></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="btn-media-replace" type="button" title="${t('profile.media_pick_other') || 'Выбрать другое'}">
          <i class="ph ph-arrows-clockwise"></i>
          <span data-i18n="profile.media_pick_other">${t('profile.media_pick_other') || 'Выбрать другое'}</span>
        </button>
        <button class="btn btn-secondary" data-close-modal="media-preview-modal" data-i18n="common.cancel">${t('common.cancel') || 'Отмена'}</button>
        <button class="btn btn-primary" id="btn-media-confirm" type="button">
          <i class="ph ph-check"></i>
          <span data-i18n="common.save">${t('common.save') || 'Сохранить'}</span>
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

// ─── Public API ──────────────────────────────────────────────────
export function wireMediaAttach({
  input, trigger, entityType,
  confirm, onSuccess,
  titleKey, hintKey,
  cropPreview = false,
  t, toast, errorMessage,
}) {
  const inputEl   = typeof input   === 'string' ? q(input)   : input;
  const triggerEl = typeof trigger === 'string' ? q(trigger) : trigger;
  if (!inputEl) return { open: () => {} };

  ensureModal(t);

  let pendingFile  = null;
  let pendingUrl   = null;

  function showPreview(file) {
    pendingFile = file;
    if (pendingUrl) URL.revokeObjectURL(pendingUrl);
    pendingUrl = URL.createObjectURL(file);
    _activeController = controller;

    q('#media-preview-image').src = pendingUrl;
    q('#media-preview-meta').textContent =
      `${file.name} · ${(file.size / 1024).toFixed(0)} KB`;
    q('#media-preview-title').textContent =
      titleKey ? (t(titleKey) || t('profile.media_preview_title') || 'Предпросмотр')
               : (t('profile.media_preview_title') || 'Предпросмотр');
    const hintEl = q('#media-preview-hint');
    if (hintEl) {
      if (hintKey) { hintEl.textContent = t(hintKey) || ''; hintEl.style.display = ''; }
      else         { hintEl.textContent = '';            hintEl.style.display = 'none'; }
    }
    // Crop preview overlay: only shown when caller asked for it.
    const overlay = q('#media-preview-overlay');
    if (overlay) {
      overlay.classList.remove('crop-circle', 'crop-square');
      if (cropPreview === 'circle') {
        overlay.classList.add('crop-circle');
        overlay.style.display = '';
      } else if (cropPreview === 'square') {
        overlay.classList.add('crop-square');
        overlay.style.display = '';
      } else {
        overlay.style.display = 'none';
      }
    }
    q('#media-preview-error')?.classList.remove('show');
    q('#media-preview-modal')?.classList.add('open');
  }

  function closeModal() {
    q('#media-preview-modal')?.classList.remove('open');
  }

  function reset() {
    pendingFile = null;
    if (pendingUrl) URL.revokeObjectURL(pendingUrl);
    pendingUrl = null;
    inputEl.value = '';
  }

  inputEl.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast(t('errors.invalid_file_type') || 'Только изображения', 'error');
      inputEl.value = '';
      return;
    }
    showPreview(file);
  });

  triggerEl?.addEventListener('click', () => inputEl.click());
  installSharedFooterHandlers();

  const controller = {
    open: () => inputEl.click(),
    async confirmSelected() {
      if (!pendingFile) return;
      const btn = q('#btn-media-confirm');
      setBusy(btn, true);
      try {
        const up = await media.uploadTemp(pendingFile, entityType);
        await confirm(up.data.media_file_id);
        closeModal();
        reset();
        onSuccess?.();
      } catch (err) {
        showError(errorMessage(err));
      } finally {
        setBusy(btn, false);
      }
    },
    replaceSelected() {
      inputEl.click();
    },
    cancelSelected() {
      closeModal();
      reset();
    },
  };

  return controller;
}

// ── Shared footer wiring (idempotent) ────────────────────────────
let _activeController = null;
let _sharedHandlersInstalled = false;
function installSharedFooterHandlers() {
  if (_sharedHandlersInstalled) return;
  _sharedHandlersInstalled = true;
  queueMicrotask(() => {
    q('#btn-media-confirm')?.addEventListener('click', () => {
      _activeController?.confirmSelected();
    });
    q('#btn-media-replace')?.addEventListener('click', () => {
      _activeController?.replaceSelected();
    });
    q('#media-preview-modal')?.addEventListener('click', (e) => {
      const closeBtn = e.target.closest('[data-close-modal="media-preview-modal"]');
      if (closeBtn) _activeController?.cancelSelected();
    });
  });
}

function setBusy(btn, on) {
  if (!btn) return;
  btn.disabled = on;
  btn.classList.toggle('btn-loading', on);
}
function showError(msg) {
  const alert = q('#media-preview-error');
  const text  = q('#media-preview-error-text');
  if (!alert || !text) return;
  text.textContent = msg;
  alert.classList.add('show');
}
