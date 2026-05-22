/* ═══════════════════════════════════════════════════════════════
   Solo «Запрос на вступление» modal (#join-org-modal).

   Открывается из solo/home.js кнопкой «Вступить по ID».
   Поля:
     • organization_id (число > 0, обязательно)
     • message (текст до 500 символов, опционально) — пойдёт
       руководителю в уведомление в качестве message_text.

   На submit вызывает membership.join(orgId, message). На успех:
     • toast «Запрос отправлен»
     • перезагрузка страницы — текущий solo-юзер становится
       pending-членом орги; role-router перенаправит его в
       соответствующее состояние (для pending: тоже solo-view,
       но с другим статус-badge'ом и без кнопки повторить).
   ═══════════════════════════════════════════════════════════════ */

import { membership } from '../../../../api.js';
import { toast, errorMessage } from '../../../../auth.js';
import { t } from '../../../../i18n.js';
import { openModal, closeModal, setLoading, setFieldError, clearFieldErrorById, showAlertText, hideAlertById } from '../../ui-helpers.js';
import { wireFormGuard } from '../../../../form-guard.js';

let _wired = false;

export function wireJoinOrgModal() {
  if (_wired) return;
  _wired = true;

  // Form-guard: серая кнопка пока org_id не введён.
  wireFormGuard({
    button:   '#btn-join-org-confirm',
    required: [{ sel: '#join-org-id', kind: 'number' }],
  });

  // Live-счётчик символов сообщения.
  const msgInput = document.querySelector('#join-org-message');
  const counter  = document.querySelector('#join-org-message-count');
  msgInput?.addEventListener('input', () => {
    if (counter) counter.textContent = String(msgInput.value.length);
  });

  document.querySelector('#btn-join-org-confirm')?.addEventListener('click', async () => {
    clearFieldErrorById('err-join-org-id');
    hideAlertById('err-join-org');

    const orgIdInput = document.querySelector('#join-org-id');
    const orgIdNum   = Number(orgIdInput?.value);
    if (!Number.isInteger(orgIdNum) || orgIdNum <= 0) {
      setFieldError('err-join-org-id', t('errors.validation.invalid_id'));
      return;
    }
    const message = (document.querySelector('#join-org-message')?.value || '').trim();

    const btn = document.querySelector('#btn-join-org-confirm');
    setLoading(btn, true);
    try {
      await membership.join(orgIdNum, message || undefined);
      closeModal('join-org-modal');
      toast(t('solo.join_sent') || 'Запрос отправлен. Ожидайте подтверждения.', 'ok');
      // Профиль изменился (membership_status='pending'). Триггерим
      // re-load профиля в index.js — НЕ перезагружаем страницу,
      // иначе PIN-gate (referrer-based) запросит PIN заново.
      // role-router внутри loadProfile сравнит новую роль и сделает
      // in-place re-mount solo home с обновлённым badge'ом.
      window.dispatchEvent(new CustomEvent('rems:reload-profile'));
    } catch (err) {
      showAlertText('err-join-org', 'err-join-org-text', errorMessage(err));
    } finally {
      setLoading(btn, false);
    }
  });
}

export function openJoinOrgModal() {
  const input = document.querySelector('#join-org-id');
  const msg   = document.querySelector('#join-org-message');
  if (input) input.value = '';
  if (msg)   msg.value = '';
  const counter = document.querySelector('#join-org-message-count');
  if (counter) counter.textContent = '0';
  clearFieldErrorById('err-join-org-id');
  hideAlertById('err-join-org');
  openModal('join-org-modal');
  setTimeout(() => input?.focus(), 80);
}
