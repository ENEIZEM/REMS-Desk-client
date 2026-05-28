/* ═══════════════════════════════════════════════════════════════
   Owner Ресурсы — Коллеги + Техника.
   Идентичен employee/team.js, но с:
     • stats-кластером (active / closed counts) на каждой строке
     • кнопкой исключения (trash) — для всех не-self не-owner.
   ═══════════════════════════════════════════════════════════════ */

import { t, applyTranslations } from '../../../../i18n.js';
import { members as membersApi } from '../../../../api.js';

// Сохраняем profile на уровне модуля, чтобы re-mount по событию
// 'rems:reload-members' (после исключения сотрудника) знал контекст.
let _ownerProfile = null;
let _reloadBound = false;

export function mountOwnerTeam(profile) {
  const tabPanel = document.querySelector('#tab-members');
  if (!tabPanel) return;
  tabPanel.classList.add('tab-fill');
  _ownerProfile = profile;

  // После удаления сотрудника (confirm в #remove-member-modal,
  // обрабатывается в dashboard/index.js) диспатчится
  // 'rems:reload-members' — перерисуем owner team in-place.
  if (!_reloadBound) {
    _reloadBound = true;
    window.addEventListener('rems:reload-members', () => {
      if (document.body.dataset.role === 'owner' && _ownerProfile) {
        mountOwnerTeam(_ownerProfile);
      }
    });
  }

  const selfId = profile?.user?.id;

  tabPanel.innerHTML = `
    <div class="page-header">
      <h1 class="page-title" data-i18n="nav.colleagues">Ресурсы</h1>
      <p class="page-desc" data-i18n="team.desc">Сотрудники вашей организации и закреплённая за ней техника.</p>
    </div>

    <div class="profile-two-col" style="margin-top:1rem;">
      <!-- LEFT: Коллеги с статистикой и кнопкой исключения -->
      <div class="profile-col">
        <div class="card profile-card fill-block">
          <div class="profile-card-header profile-card-header--with-actions">
            <div class="profile-card-icon navy"><i class="ph-bold ph-users"></i></div>
            <h3 class="profile-card-title" data-i18n="team.colleagues_title">Коллеги</h3>
            <span id="team-colleagues-count" class="badge badge-default" style="margin-left:.4rem;"></span>
            <span class="profile-card-tooltip profile-card-tooltip--end" tabindex="0" data-tooltip-key="team.colleagues_hint">
              <i class="ph ph-info"></i>
            </span>
          </div>
          <div class="profile-card-body requests-feed-body" id="team-colleagues-body">
            <div class="empty-state empty-state--inline">
              <i class="ph ph-users"></i>
              <span class="empty-state-text" data-i18n="team.colleagues_loading">Загрузка…</span>
            </div>
          </div>
        </div>
      </div>

      <!-- RIGHT: Техника (placeholder) -->
      <div class="profile-col">
        <div class="card profile-card fill-block">
          <div class="profile-card-header profile-card-header--with-actions">
            <div class="profile-card-icon teal"><i class="ph-bold ph-desktop-tower"></i></div>
            <h3 class="profile-card-title" data-i18n="team.equipment_title">Техника</h3>
            <span class="profile-card-tooltip profile-card-tooltip--end" tabindex="0" data-tooltip-key="team.equipment_hint">
              <i class="ph ph-info"></i>
            </span>
          </div>
          <div class="profile-card-body requests-feed-body">
            <div class="empty-state empty-state--inline">
              <i class="ph ph-desktop-tower"></i>
              <span class="empty-state-text" data-i18n="team.equipment_empty">Список оборудования появится здесь, когда руководитель его заведёт.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  applyTranslations();
  loadColleagues(selfId);
}

async function loadColleagues(selfId) {
  const body  = document.querySelector('#team-colleagues-body');
  const count = document.querySelector('#team-colleagues-count');
  if (!body) return;
  try {
    const data = await membersApi.list();
    const approved = data?.data?.approved || [];
    const pending  = data?.data?.pending  || [];
    // Счётчик = одобренные + ожидающие (общая длина списка плашек).
    if (count) count.textContent = String(approved.length + pending.length);
    if (!approved.length && !pending.length) {
      body.innerHTML = `
        <div class="empty-state empty-state--inline">
          <i class="ph ph-users"></i>
          <span class="empty-state-text" data-i18n="team.colleagues_empty">В организации пока только вы.</span>
        </div>`;
      applyTranslations();
      return;
    }
    // Pending-плашки сверху (требуют действия владельца), затем approved.
    body.innerHTML =
      pending.map(m => pendingRowHTML(m)).join('') +
      approved.map(m => colleagueRowHTML(m, selfId)).join('');

    // Wire remove-buttons.
    body.querySelectorAll('[data-action="remove-member"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id   = btn.getAttribute('data-id');
        const name = btn.getAttribute('data-name') || '';
        // Открываем общую модалку #remove-member-modal (та же что у
        // members tab). confirm-кнопку обрабатывает dashboard/index.js,
        // он удалит + диспатчит 'rems:reload-members' → mountOwnerTeam.
        window.dispatchEvent(new CustomEvent('rems:remove-member', {
          detail: { id, name },
        }));
      });
    });

    // Wire «Рассмотреть» — открывает #member-decision-modal через event-bus.
    // dashboard/index.js обработает accept/reject + перерисует список.
    body.querySelectorAll('[data-action="review-member"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        window.dispatchEvent(new CustomEvent('rems:member-decision', {
          detail: {
            id:      btn.getAttribute('data-id'),
            name:    btn.getAttribute('data-name') || '',
            message: btn.getAttribute('data-message') || '',
          },
        }));
      });
    });
  } catch (err) {
    body.innerHTML = `
      <div class="empty-state empty-state--inline">
        <i class="ph ph-warning-circle"></i>
        <span class="empty-state-text">${escapeHTML(err?.message || 'error')}</span>
      </div>`;
  }
}

function colleagueRowHTML(m, selfId) {
  const avatarTile = m.avatar?.url
    ? `<img src="${escapeHTML(m.avatar.url)}" alt="">`
    : `<span>${escapeHTML(initialsOf(m.full_name))}</span>`;
  const contact = m.email_masked || m.phone_masked || '—';
  const dept    = m.department || t('members.no_department');
  const isOwner = m.org_role === 'owner';
  const isSelf  = selfId != null && Number(selfId) === Number(m.id);
  const roleLbl = isOwner ? t('roles.owner') : t('roles.employee');
  const stats = m.stats || {};
  const active = Number(stats.active ?? 0);
  const closed = Number(stats.closed ?? 0);
  const hasRating = stats.rating_avg != null && Number(stats.rating_count) > 0;
  const ratingAvg = hasRating ? Number(stats.rating_avg).toFixed(1) : '';
  // Строка рейтинга в meta — звезда + число, или «нет оценок».
  const ratingMeta = hasRating
    ? `<span class="team-colleague-rating">${ratingAvg}<i class="ph-fill ph-star"></i></span>`
    : `<span class="team-colleague-rating is-empty">${t('employee.stat_rating_empty')}</span>`;
  // Удалить можно: не себя, не другого owner'а.
  const canRemove = !isSelf && !isOwner;
  return `
    <div class="team-colleague-row">
      <div class="avatar avatar-md">${avatarTile}</div>
      <div class="team-colleague-text">
        <div class="team-colleague-name">${escapeHTML(m.full_name)}</div>
        <div class="team-colleague-contact">${escapeHTML(contact)}</div>
        <div class="team-colleague-meta">${escapeHTML(dept)} · ${ratingMeta}</div>
      </div>
      <div class="team-colleague-stats">
        <span class="team-stat-pill is-active" title="${t('members.stat_active')}">${active}<span> ${t('members.stat_active')}</span></span>
        <span class="team-stat-pill is-closed" title="${t('members.stat_closed')}">${closed}<span> ${t('members.stat_closed')}</span></span>
      </div>
      <div class="team-colleague-actions">
        <span class="badge ${isOwner ? 'badge-role-owner' : 'badge-role-employee'} team-role-badge">${escapeHTML(roleLbl)}</span>
        ${isSelf
          ? `<span class="members-row-self" title="${t('members.you')}">${t('members.you')}</span>`
          : ''}
        ${canRemove
          ? `<button class="members-row-delete btn-remove"
                     data-action="remove-member" data-id="${m.id}"
                     data-name="${escapeHTML(m.full_name)}"
                     title="${t('members.remove')}" aria-label="${t('members.remove')}">
               <i class="ph-bold ph-trash"></i>
             </button>`
          : ''}
      </div>
    </div>`;
}

// Плашка соискателя (pending) — визуально отличается badge «Ожидает»
// и кнопкой «Рассмотреть» (а не trash). Показываем рейтинг + сообщение.
function pendingRowHTML(m) {
  const avatarTile = m.avatar?.url
    ? `<img src="${escapeHTML(m.avatar.url)}" alt="">`
    : `<span>${escapeHTML(initialsOf(m.full_name))}</span>`;
  const contact = m.email_masked || m.phone_masked || '—';
  const dept    = m.department || t('members.no_department');
  const stats   = m.stats || {};
  const hasRating = stats.rating_avg != null && Number(stats.rating_count) > 0;
  const ratingAvg = hasRating ? Number(stats.rating_avg).toFixed(1) : '';
  const ratingMeta = hasRating
    ? `<span class="team-colleague-rating">${ratingAvg}<i class="ph-fill ph-star"></i></span>`
    : `<span class="team-colleague-rating is-empty">${t('employee.stat_rating_empty')}</span>`;
  const inviteMsg = (m.invite_message || '').trim();
  return `
    <div class="team-colleague-row team-colleague-row--pending">
      <div class="avatar avatar-md">${avatarTile}</div>
      <div class="team-colleague-text">
        <div class="team-colleague-name">${escapeHTML(m.full_name)}</div>
        <div class="team-colleague-contact">${escapeHTML(contact)}</div>
        <div class="team-colleague-meta">${escapeHTML(dept)} · ${ratingMeta}</div>
      </div>
      <div class="team-colleague-actions">
        <span class="badge badge-warning team-role-badge">${t('members.pending_badge')}</span>
        <button class="btn btn-sm btn-primary"
                data-action="review-member" data-id="${m.id}"
                data-name="${escapeHTML(m.full_name)}"
                data-message="${escapeHTML(inviteMsg)}">
          <i class="ph ph-user-check"></i>
          <span>${t('members.decision_review')}</span>
        </button>
      </div>
    </div>`;
}

function initialsOf(name) {
  return String(name || '?')
    .trim().split(/\s+/).slice(0, 2)
    .map(s => s[0]?.toUpperCase() || '').join('') || '?';
}
function escapeHTML(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
