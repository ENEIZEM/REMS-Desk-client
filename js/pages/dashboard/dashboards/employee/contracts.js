/* ═══════════════════════════════════════════════════════════════
   Employee Contracts placeholder.
   Сотрудник видит список контрактов своей орги (read-only).
   Реальный API ещё не реализован — рендерим заглушку с
   объяснением и стандартными стилевыми блоками.
   ═══════════════════════════════════════════════════════════════ */

import { t, applyTranslations } from '../../../../i18n.js';

export function mountEmployeeContracts(profile) {
  const slot = document.querySelector('#contracts-slot');
  if (!slot) return;
  const tabPanel = document.querySelector('#tab-contracts');
  if (tabPanel) tabPanel.classList.add('tab-fill');
  const orgName = profile?.organization?.name || '—';

  const html = `
    <div class="page-header">
      <h1 class="page-title" data-i18n="nav.contracts">Контракты</h1>
      <p class="page-desc" data-i18n="contracts.desc">Список контрактов вашей организации.</p>
    </div>

    <div class="card profile-card fill-block">
      <div class="profile-card-header profile-card-header--with-actions">
        <div class="profile-card-icon navy"><i class="ph-bold ph-handshake"></i></div>
        <h3 class="profile-card-title" data-i18n="contracts.org_contracts">Контракты организации</h3>
        <div class="notif-header-actions">
          <span class="profile-card-tooltip profile-card-tooltip--end" tabindex="0" data-tooltip-key="contracts.hint">
            <i class="ph ph-info"></i>
          </span>
        </div>
      </div>
      <div class="profile-card-body requests-feed-body">
        <div class="empty-state empty-state--inline">
          <i class="ph ph-handshake"></i>
          <span class="empty-state-text" data-i18n="contracts.empty">
            Контрактов ещё нет. Когда руководитель ${escapeHTML(orgName)} оформит контракт, он появится здесь.
          </span>
        </div>
      </div>
    </div>
  `;
  slot.innerHTML = html;
  applyTranslations();
}

function escapeHTML(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
