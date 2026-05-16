/* ═══════════════════════════════════════════════════════════════
   "Ваша организация" tab — header strip + 2-column body.
   Pure render: takes (org, role, canEditOrg, canEditLim) and
   paints the existing DOM. No fetching, no state.
   ═══════════════════════════════════════════════════════════════ */

import { t } from '../../../i18n.js';
import {
  orgStatusBadge, roleBadgeDescriptor,
  renderIconBadge, renderRowChip,
} from '../badges.js';
import { fmtDate, fmtBytes, initials } from '../format.js';

// Render an "Разрешено/Запрещено" feature flag as a row chip
// (text + duotone icon, no container) — matches the rest of the
// read-only rows in the Лимиты organizational card.
function setFeaturePill(el, allowed) {
  if (!el) return;
  const desc = allowed
    ? { key: 'profile.feature_allowed', chip: 'chip-allowed', icon: 'ph-check-circle' }
    : { key: 'profile.feature_denied',  chip: 'chip-denied',  icon: 'ph-prohibit'    };
  renderRowChip(el, desc);
}

export function populateOrgTab(org, role, canEditOrg, canEditLim) {
  // ── Header strip ────────────────────────────────────────────
  document.querySelector('#org-head-name').textContent = org.name || '—';
  document.querySelector('#org-head-id').textContent   = `#${org.id}`;
  // Per spec: header shows the current TARIFF (subscription plan), not
  // member count. Member count lives in the Подписка card.
  document.querySelector('#org-head-plan').textContent = org.subscription_purchased ? 'Pro' : 'Free';

  // org_type badge intentionally not rendered — see badges.js comment.
  renderIconBadge(document.querySelector('#org-head-active'), orgStatusBadge(org.is_active));
  renderIconBadge(document.querySelector('#org-head-myrole'), roleBadgeDescriptor(role));

  // ── Logo ────────────────────────────────────────────────────
  const logoImg  = document.querySelector('#org-logo-img');
  const logoIni  = document.querySelector('#org-logo-initials');
  const logoWrap = document.querySelector('#org-logo-wrap');
  const logoOvr  = document.querySelector('#org-logo-overlay');
  if (org.logo?.url) {
    logoImg.src = org.logo.url;
    logoImg.style.display = '';
    logoIni.style.display = 'none';
  } else {
    logoIni.textContent = initials(org.name || 'O');
    logoIni.style.display = '';
    logoImg.style.display = 'none';
  }
  if (canEditOrg) { logoWrap.classList.add('editable'); logoOvr.style.display = ''; }
  else            { logoWrap.classList.remove('editable'); logoOvr.style.display = 'none'; }

  // ── About card — container-less chips for read-only rows ───
  // org_type row removed alongside the column itself.
  renderRowChip(document.querySelector('#org-info-status'), orgStatusBadge(org.is_active));
  renderRowChip(document.querySelector('#org-info-myrole'), roleBadgeDescriptor(role));
  document.querySelector('#org-info-created').textContent = fmtDate(org.created_at);
  document.querySelector('#org-info-updated').textContent = fmtDate(org.updated_at);

  // Role-change tooltip — irrelevant once the role list collapsed to
  // owner+employee. Owner needs no hint; employee can't change role
  // through self-service either. Keep the element hidden.
  document.querySelector('#org-info-role-tooltip')?.classList.add('hidden');

  // ── Subscription + counters ────────────────────────────────
  document.querySelector('#sub-plan-line').textContent = org.subscription_purchased ? 'Pro' : 'Free';
  document.querySelector('#sub-employee-usage').textContent  = org.limits ? `${org.current_employee_count ?? 0} / ${org.limits.max_employees}` : '—';
  // Active-request usage placeholder — counts of active requests are not
  // tracked yet in the API; show 0 until the requests endpoint reports it.
  document.querySelector('#sub-active-req-usage').textContent = org.limits ? `0 / ${org.limits.max_active_requests}` : '—';

  // ── Limits card: pill on right + secondary "до N · X MB" sub ──
  if (org.limits) {
    const L = org.limits;
    setFeaturePill(document.querySelector('#lim-images-flag'),    L.allow_image_uploads);
    setFeaturePill(document.querySelector('#lim-videos-flag'),    L.allow_video_uploads);
    setFeaturePill(document.querySelector('#lim-docs-flag'),      L.allow_document_uploads);
    setFeaturePill(document.querySelector('#lim-analytics-flag'), L.has_analytics);
    setFeaturePill(document.querySelector('#lim-export-flag'),    L.has_export);

    // Sub-lines: "до N шт./заявку · X MB" — both prefix and unit go through
    // i18n so the line gets a proper English translation ("up to N pcs.").
    const perReq  = t('profile.per_request');
    const upTo    = t('profile.up_to');
    const pcsUnit = t('profile.pcs_unit');
    document.querySelector('#lim-images-sub').textContent =
      `${upTo} ${L.max_photo_per_request} ${pcsUnit}${perReq} · ${fmtBytes(L.max_image_upload_size_bytes)}`;
    document.querySelector('#lim-videos-sub').textContent =
      `${upTo} ${L.max_videos_per_request} ${pcsUnit}${perReq} · ${fmtBytes(L.max_video_upload_size_bytes)} · ${L.max_video_duration_seconds}${t('profile.seconds_short')}`;
    document.querySelector('#lim-docs-sub').textContent =
      `${upTo} ${L.max_document_per_request} ${pcsUnit}${perReq} · ${fmtBytes(L.max_document_upload_size_bytes)}`;

    // ── SLA values ─────────────────────────────────────────────
    document.querySelector('#sla-crit').textContent = `${L.internal_sla_critical_h} ${t('profile.hours_short')}`;
    document.querySelector('#sla-high').textContent = `${L.internal_sla_high_h} ${t('profile.hours_short')}`;
    document.querySelector('#sla-med').textContent  = `${L.internal_sla_medium_h} ${t('profile.hours_short')}`;
    document.querySelector('#sla-low').textContent  = `${L.internal_sla_low_h} ${t('profile.hours_short')}`;
  }

  // ── Show/hide edit-pencils based on permissions ────────────
  document.querySelectorAll('#tab-org .profile-row-edit-btn').forEach(btn => {
    const field = btn.dataset.editField;
    const isSlaField = field && field.startsWith('internal_sla_');
    btn.style.display = (isSlaField ? canEditLim : canEditOrg) ? '' : 'none';
  });
}
