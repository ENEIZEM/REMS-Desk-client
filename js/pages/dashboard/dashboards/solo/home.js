/* ═══════════════════════════════════════════════════════════════
   Solo Home — главная страница юзера без организации.

   Левая колонка:
     • Карточка «Работа в организации» — текущий статус + одна
       кнопка «Запросить членство по ID» (открывает join-modal).
       Создавать орг через UI не даём — функции нет в backend'е.
     • Карточка «Статистика» под ней — заявок создано/выполнено
       + средняя оценка (duotone-звезда, не emoji).

   Правая колонка:
     • Карточка «Уведомления» — высота выровнена с суммой высот
       левой колонки (через CSS .solo-two-col → align-items:stretch
       + sticky-like растягивание правой карточки).

   ── Что не делаем ──────────────────────────────────────────────
   • Никакого «вас исключили из такой-то орги» — у нас нет аудита
     прошлых членств; статус показан нейтрально.
   • Нет кнопки «Создать организацию» — в backend нет endpoint'а
     create-org-from-dashboard.
   ═══════════════════════════════════════════════════════════════ */

import { t }       from '../../../../i18n.js';
import { membership } from '../../../../api.js';
import { toast, errorMessage } from '../../../../auth.js';
import { wireJoinOrgModal, openJoinOrgModal } from './join-modal.js';
import { setNotificationsTarget, loadNotifications } from '../../notifications.js';
import { openModal, closeModal, setLoading } from '../../ui-helpers.js';

function escapeHTML(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function mountSoloHome(profile) {
  const slot = document.querySelector('#solo-home-slot');
  if (!slot) return;

  // /profile/me возвращает `membership` объект ТОЛЬКО для solo (status=null)
  // и rejected — для pending этого поля НЕТ. Поэтому fallback к
  // user.membership_status (snake_case в payload).
  const lastStatus = profile?.membership?.status ?? profile?.user?.membership_status ?? null;
  const isPending  = lastStatus === 'pending';
  // pending_org добавлен в /profile/me response для solo+pending случая
  // (orgPayload=null когда не approved). Используем как primary source.
  const pendingOrg = profile?.pending_org || null;
  const orgId      = pendingOrg?.id   ?? profile?.organization?.id   ?? null;
  const orgName    = pendingOrg?.name ?? profile?.organization?.name ?? '';
  // Направление pending-связи: 'from_user' = солошник подал заявку;
  // 'from_org' = owner пригласил, юзер должен сам принять. Null/missing
  // — fallback на legacy 'from_user' (до миграции колонок).
  const inviteDirection = pendingOrg?.invite_direction || 'from_user';
  const inviteMessage   = pendingOrg?.invite_message || '';
  const isInvitation    = isPending && inviteDirection === 'from_org';
  // Статус-badge: invitation подсвечивается отдельно, чтобы юзер
  // понимал что это новое приглашение ему, а не просто «ожидание».
  const statusBadgeHTML = isInvitation
    ? `<span class="badge badge-info"><i class="ph ph-envelope-open"></i><span data-i18n="solo.status_invited">Вас приглашают</span></span>`
    : isPending
    ? `<span class="badge badge-warning"><i class="ph ph-hourglass"></i><span data-i18n="solo.status_pending">На рассмотрении</span></span>`
    : `<span class="badge badge-default" data-i18n="solo.status_unaffiliated">Не состою в организации</span>`;

  const orgLabel = orgName
    ? (orgId ? `«${orgName}» (ID ${orgId})` : `«${orgName}»`)
    : (orgId ? `ID ${orgId}` : '');

  // Тело-action: 3 варианта.
  //   1. Invitation (from_org) — accept/reject + текст owner'а если был.
  //   2. Self-request (from_user, pending) — кнопка «Отменить запрос».
  //   3. Solo без pending — кнопка «Запросить членство по ID».
  const actionRowHTML = isInvitation
    ? `
        <div class="solo-invite-card">
          <div class="solo-invite-head">
            <i class="ph-duotone ph-envelope-open solo-invite-icon"></i>
            <span class="solo-invite-title">
              ${t('solo.invitation_title', { org: orgLabel }) || 'Приглашение от ' + orgLabel}
            </span>
          </div>
          ${inviteMessage ? `
            <div class="solo-invite-message" data-tooltip-text="${escapeHTML(inviteMessage)}">
              <span class="solo-invite-message-label" data-i18n="solo.invitation_from_owner">Сообщение руководителя:</span>
              <span class="solo-invite-message-text">${escapeHTML(inviteMessage)}</span>
            </div>` : ''}
          <div class="solo-invite-actions">
            <button id="solo-btn-invite-accept" class="btn btn-primary">
              <i class="ph ph-check"></i>
              <span data-i18n="solo.invitation_accept">Принять</span>
            </button>
            <button id="solo-btn-invite-reject" class="btn btn-secondary">
              <i class="ph ph-x"></i>
              <span data-i18n="solo.invitation_reject">Отклонить</span>
            </button>
          </div>
        </div>`
    : isPending
    ? `
        <div class="solo-pending-hint">
          <i class="ph-duotone ph-hourglass-medium"></i>
          <span data-i18n="solo.pending_hint">Ожидайте подтверждения. Когда руководитель примет заявку, дашборд автоматически обновится.</span>
        </div>
        <button id="solo-btn-cancel" class="btn btn-danger w-full" style="margin-top:0.5rem;">
          <i class="ph ph-x-circle"></i>
          <span>${t('solo.btn_cancel_in_org', { org: orgLabel }) || 'Отменить запрос в ' + orgLabel}</span>
        </button>`
    : `
        <button id="solo-btn-join" class="btn btn-primary w-full">
          <i class="ph ph-sign-in"></i>
          <span data-i18n="solo.btn_join">Запросить членство в организации</span>
        </button>`;

  // Статистика — пока 0 у всех (нет таблицы requests/ratings).
  // Цифры читаются из profile.stats если бэк отдаст; иначе 0.
  const stats = profile?.user?.stats || {};
  const createdN  = Number(stats.requests_created  ?? 0);
  const handledN  = Number(stats.requests_handled  ?? 0);
  // Рейтинг: строка показывается всегда, но если ratings нет — справа
  // выводим текстовую плашку «Нет оценок» вместо «—»+звезды.
  const hasRating  = stats.rating_avg != null && handledN > 0;
  const ratingAvg  = hasRating ? Number(stats.rating_avg).toFixed(1) : '';

  slot.innerHTML = `
    <div class="page-header">
      <h1 class="page-title" data-i18n="solo.title">Главная</h1>
      <p class="page-desc" data-i18n="solo.subtitle">Вы пока не в организации — здесь можно подать заявку на вступление.</p>
    </div>

    <div class="profile-two-col solo-two-col">

      <!-- ═══ ЛЕВАЯ: Работа в орге + Статистика ═══ -->
      <div class="profile-col solo-col-left">
        <div class="card profile-card">
          <div class="profile-card-header">
            <div class="profile-card-icon navy"><i class="ph-bold ph-buildings"></i></div>
            <h3 class="profile-card-title" data-i18n="solo.work_in_org_title">Работа в организации</h3>
          </div>
          <div class="profile-card-body">
            <div class="profile-row">
              <span class="profile-row-label" data-i18n="solo.status_label">Текущий статус</span>
              <span class="profile-row-edit-wrap">
                ${statusBadgeHTML}
              </span>
            </div>
            <div class="profile-row profile-row--stack" style="border-bottom:none;">
              ${actionRowHTML}
            </div>
          </div>
        </div>

        <div class="card profile-card" style="margin-top:1rem;">
          <div class="profile-card-header">
            <div class="profile-card-icon teal"><i class="ph-bold ph-chart-bar"></i></div>
            <h3 class="profile-card-title" data-i18n="solo.stats_title">Статистика</h3>
          </div>
          <div class="profile-card-body">
            <!-- Текстовые надписи слева, значения справа — так же как
                 во всех остальных профильных карточках. Иконки убраны
                 для согласованности с остальным UI. Рейтинг показывается
                 всегда; если у юзера ещё нет оценок — справа выводим
                 «Нет оценок» вместо плашки с числом и звездой. -->
            <div class="profile-row">
              <span class="profile-row-label" data-i18n="solo.stats_created">Открыто заявок мною</span>
              <span class="profile-row-value">${createdN}</span>
            </div>
            <div class="profile-row">
              <span class="profile-row-label" data-i18n="solo.stats_handled">Закрыто заявок мною</span>
              <span class="profile-row-value">${handledN}</span>
            </div>
            <div class="profile-row" style="border-bottom:none;">
              <span class="profile-row-label" data-i18n="solo.stats_rating">Средняя оценка работы</span>
              <span class="profile-row-value">
                ${hasRating
                  ? `${ratingAvg}<i class="ph-duotone ph-star stat-rating-star" aria-hidden="true" style="margin-left:.35rem;"></i>`
                  : `<span class="stats-empty" data-i18n="solo.stats_rating_empty">Нет оценок</span>`}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- ═══ ПРАВАЯ: Уведомления ═══ -->
      <div class="profile-col solo-col-right">
        <div class="card profile-card solo-notifs-card">
          <div class="profile-card-header profile-card-header--with-actions">
            <div class="profile-card-icon teal"><i class="ph-bold ph-bell"></i></div>
            <h3 class="profile-card-title" data-i18n="solo.notifications_title">Уведомления</h3>
            <div class="notif-header-actions">
              <div class="notif-filter" role="tablist" data-notif-filter-host>
                <button type="button" class="notif-filter-btn is-active"
                        data-filter="all" role="tab" aria-selected="true"
                        data-i18n="notifications.filter_all">Все</button>
                <button type="button" class="notif-filter-btn"
                        data-filter="unread" role="tab" aria-selected="false">
                  <span data-i18n="notifications.filter_unread">Непрочитанные</span>
                  <span class="notif-filter-count" data-unread-count></span>
                </button>
              </div>
              <button class="btn btn-secondary btn-sm" data-mark-all-read>
                <i class="ph ph-checks"></i>
                <span data-i18n="notifications.mark_all">Прочитать все</span>
              </button>
            </div>
          </div>
          <div class="profile-card-body" id="solo-notifs-slot">
            <!-- Inline empty-state в строчку (как в общей ленте), иконка
                 + текст в одной строке. Когда придут реальные уведомления,
                 notifications.js перепишет innerHTML. -->
            <div class="empty-state solo-notifs-empty">
              <i class="ph ph-bell-slash"></i>
              <span class="empty-state-text" data-i18n="solo.notifications_empty">Нет уведомлений</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Wire join-modal один раз (idempotent).
  wireJoinOrgModal();
  slot.querySelector('#solo-btn-join')?.addEventListener('click', () => openJoinOrgModal());

  // Invitation accept / reject. Accept → флипает membership на approved
  // (owner уже одобрил приглашением, дополнительного подтверждения не
  // требуется). Reject → cancel (= возврат в solo) с уведомлением owner'у.
  slot.querySelector('#solo-btn-invite-accept')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    setLoading(btn, true);
    try {
      await membership.acceptInvitation();
      toast(t('solo.invitation_accepted_toast') || 'Приглашение принято', 'ok');
      window.dispatchEvent(new CustomEvent('rems:reload-profile'));
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setLoading(btn, false);
    }
  });
  slot.querySelector('#solo-btn-invite-reject')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    setLoading(btn, true);
    try {
      await membership.cancel();   // re-uses cancel.delete — owner получит withdrawn-notif
      toast(t('solo.invitation_rejected_toast') || 'Приглашение отклонено', 'ok');
      window.dispatchEvent(new CustomEvent('rems:reload-profile'));
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setLoading(btn, false);
    }
  });

  // Отмена pending-заявки — открывает confirm-модалку.
  slot.querySelector('#solo-btn-cancel')?.addEventListener('click', () => {
    const targetSpan = document.querySelector('#cancel-req-target');
    if (targetSpan) targetSpan.textContent = orgLabel;
    openModal('cancel-request-modal');
  });
  // Confirm cancel (один раз навешиваем, idempotent через global flag).
  if (!window.__remsCancelRequestWired) {
    window.__remsCancelRequestWired = true;
    document.querySelector('#btn-cancel-request-confirm')?.addEventListener('click', async () => {
      const btn = document.querySelector('#btn-cancel-request-confirm');
      setLoading(btn, true);
      try {
        await membership.cancel();
        closeModal('cancel-request-modal');
        toast(t('solo.cancel_done') || 'Заявка отменена', 'ok');
        window.dispatchEvent(new CustomEvent('rems:reload-profile'));
      } catch (err) {
        toast(errorMessage(err), 'error');
      } finally {
        setLoading(btn, false);
      }
    });
  }

  // Подключаем РЕАЛЬНУЮ ленту notifications в правую карточку.
  // Solo юзер обычно получает только персональные (new_session etc),
  // но если он PENDING — то ещё и события от орги (join_accepted /
  // join_rejected). RLS-политика notif_org_isolation допускает
  // recipient_id = current_user OR organization_id = current_org —
  // pending-юзер уже имеет organization_id, так что org-scoped
  // уведомления тоже подтянутся.
  setNotificationsTarget('#solo-notifs-slot');
  loadNotifications().catch(err => console.warn('[solo notifications]', err));
}
