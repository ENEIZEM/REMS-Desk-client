/* ═══════════════════════════════════════════════════════════════
   REMS — Dashboard page logic
   Tabs: overview, requests, equipment, notifications, members, org, profile
   ═══════════════════════════════════════════════════════════════ */

import { auth, profile, org, members, notifications, media } from '../api.js';
import { requireAuth, logout, toast, errorMessage }    from '../auth.js';
import { t, initI18n, getLang, onLangChange }          from '../i18n.js';
import { connectSocket, on as socketOn }               from '../socket.js';
import { wireFormGuard }                               from '../form-guard.js';
import { wireMediaAttach }                             from '../media-attach.js';

// ── Init ──────────────────────────────────────────────────────────
await initI18n();
if (!requireAuth()) throw new Error('not logged in');

// ─────────────────────────────────────────────────────────────────
// TAB NAVIGATION
// ─────────────────────────────────────────────────────────────────
const TAB_IDS = ['overview', 'requests', 'equipment', 'notifications', 'members', 'org', 'profile'];
let currentTab = 'overview';

function switchTab(name, { updateHash = true } = {}) {
  if (!TAB_IDS.includes(name)) return;
  currentTab = name;
  document.querySelectorAll('.nav-item[data-tab]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === name);
  });
  TAB_IDS.forEach(id => {
    document.getElementById(`tab-${id}`)?.classList.toggle('active', id === name);
  });
  // Sync URL hash so a hard-reload or shared link reopens the same tab.
  // We do this with replaceState to avoid polluting browser history with
  // every sidebar click.
  if (updateHash) {
    try {
      const nextHash = '#' + name;
      if (location.hash !== nextHash) {
        history.replaceState(null, '', location.pathname + location.search + nextHash);
      }
    } catch {}
  }
  if (name === 'notifications') loadNotifications();
  if (name === 'members')       loadMembers();
  if (name === 'org')           loadOrgProfile();
  if (name === 'profile')       loadSessions();    // refresh session list each open
}

document.querySelectorAll('.nav-item[data-tab]').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});
document.querySelectorAll('[data-tab-trigger]').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tabTrigger));
});

// Open the tab matching #hash on initial load (e.g. landing-header
// "Профиль" link → /pages/dashboard.html#profile) AND on hashchange
// (e.g. user presses Back).
function applyHashTab() {
  const tab = (location.hash || '').replace(/^#/, '');
  if (TAB_IDS.includes(tab)) switchTab(tab, { updateHash: false });
}
window.addEventListener('hashchange', applyHashTab);
// "settings" is currently mapped to the same panel as "profile" — keep it
// here so the landing-header dropdown link works.
if (location.hash === '#settings') switchTab('profile', { updateHash: false });
else applyHashTab();

// ─────────────────────────────────────────────────────────────────
// USER DROPDOWN
// ─────────────────────────────────────────────────────────────────
const userDropdown = q('#user-dropdown');

q('#btn-user-menu')?.addEventListener('click', (e) => {
  e.stopPropagation();
  userDropdown?.classList.toggle('hidden');
});
document.addEventListener('click', () => userDropdown?.classList.add('hidden'));
q('#dd-profile')?.addEventListener('click',  () => { userDropdown?.classList.add('hidden'); switchTab('profile'); });
// Org row inside the dropdown → switch to the org tab. Only meaningful for
// approved members (otherwise the tab is hidden and switchTab() no-ops).
q('#dd-org-link')?.addEventListener('click', () => { userDropdown?.classList.add('hidden'); switchTab('org'); });
q('#btn-logout')?.addEventListener('click',  () => logout());

// ─────────────────────────────────────────────────────────────────
// SIDEBAR MOBILE TOGGLE
// ─────────────────────────────────────────────────────────────────
const sidebar = q('#sidebar');
const sidebarToggle = q('#sidebar-toggle');

function checkMobile() {
  const isMobile = window.innerWidth <= 768;
  if (sidebarToggle) sidebarToggle.style.display = isMobile ? '' : 'none';
}
checkMobile();
window.addEventListener('resize', checkMobile);

sidebarToggle?.addEventListener('click', () => sidebar?.classList.toggle('open'));
document.addEventListener('click', (e) => {
  if (sidebar?.classList.contains('open') && !sidebar.contains(e.target) && e.target !== sidebarToggle) {
    sidebar.classList.remove('open');
  }
});

// ─────────────────────────────────────────────────────────────────
// NOTIFICATIONS BUTTON
// ─────────────────────────────────────────────────────────────────
q('#btn-notifications')?.addEventListener('click', () => switchTab('notifications'));

// ─────────────────────────────────────────────────────────────────
// MODAL HELPERS
// ─────────────────────────────────────────────────────────────────
function openModal(id)  { q(`#${id}`)?.classList.add('open'); }
function closeModal(id) { q(`#${id}`)?.classList.remove('open'); }

document.querySelectorAll('[data-close-modal]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
});
// Backdrop click does NOT close the modal. Every modal has explicit
// Cancel / Back / × buttons — accidental outside-clicks would otherwise
// wipe whatever the user had typed.

// ─────────────────────────────────────────────────────────────────
// LOAD USER PROFILE
// ─────────────────────────────────────────────────────────────────
let _userProfile = null;
// Verified contacts the user can prove ownership of for step-up auth
// (change password / change contact). Populated by loadProfile().
let _availableContacts = [];

function fmtDate(value) {
  if (!value) return t('profile.never') || '—';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(getLang() === 'en' ? 'en-GB' : 'ru-RU', {
      year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return '—'; }
}

// ─────────────────────────────────────────────────────────────────
// Status / role descriptors.
// Each descriptor returns: { key (i18n), chip (CSS modifier for .row-chip
// AND legacy .badge variant), badge (legacy pill class for the IDENTITY
// strip), icon (duotone variant — Phosphor "ph-duotone ph-…") }.
// The chip+badge separation lets the prominent identity strip keep its
// filled pill while in-row contexts (role/status/type) render as
// text+icon chips per the redesign spec.
// ─────────────────────────────────────────────────────────────────
function statusBadge(status) {
  switch (status) {
    case 'approved':  return { key: 'membership.status_approved',  chip: 'chip-success', badge: 'badge-success', icon: 'ph-check-circle' };
    case 'pending':   return { key: 'membership.status_pending',   chip: 'chip-warning', badge: 'badge-warning', icon: 'ph-hourglass-medium' };
    case 'rejected':  return { key: 'membership.status_rejected',  chip: 'chip-error',   badge: 'badge-error',   icon: 'ph-x-circle' };
    case 'suspended': return { key: 'membership.status_suspended', chip: 'chip-default', badge: 'badge-default', icon: 'ph-pause-circle' };
    default:          return { key: 'membership.status_unknown',   chip: 'chip-default', badge: 'badge-default', icon: 'ph-question' };
  }
}

function orgStatusBadge(isActive) {
  return isActive
    ? { key: 'profile.org_status_active',   chip: 'chip-success', badge: 'badge-success', icon: 'ph-check-circle' }
    : { key: 'profile.org_status_inactive', chip: 'chip-default', badge: 'badge-default', icon: 'ph-prohibit' };
}

function orgTypeBadge(occupation) {
  return occupation === 'contractor'
    ? { key: 'profile.org_type_contractor', chip: 'chip-contractor', badge: 'badge-type-contractor', icon: 'ph-wrench' }
    : { key: 'profile.org_type_customer',   chip: 'chip-customer',   badge: 'badge-type-customer',   icon: 'ph-storefront' };
}

function roleBadgeDescriptor(role) {
  switch (role) {
    case 'owner':      return { key: 'roles.owner',      chip: 'chip-owner',      badge: 'badge-role-owner',      icon: 'ph-shield-star' };
    case 'manager':    return { key: 'roles.manager',    chip: 'chip-manager',    badge: 'badge-role-manager',    icon: 'ph-briefcase' };
    case 'technician': return { key: 'roles.technician', chip: 'chip-technician', badge: 'badge-role-technician', icon: 'ph-wrench' };
    case 'employee':   return { key: 'roles.employee',   chip: 'chip-employee',   badge: 'badge-role-employee',   icon: 'ph-user' };
    default:
      // Fallback for null/undefined/unknown roles — show a generic dash
      // rather than rendering the literal "roles.undefined" key when the
      // user is logged in but hasn't been approved yet.
      return { key: 'membership.status_unknown', chip: 'chip-default', badge: 'badge-default', icon: 'ph-user' };
  }
}

// ── Render an old-style filled badge pill (identity strip).
// The header strip USES THE REGULAR Phosphor variant (not duotone) per
// the redesign — solid icons read better against the filled pill.
// IMPORTANT: data-i18n lives on the INNER <span> only — applyTranslations()
// uses textContent = t(...), which would otherwise wipe the icon child.
function renderIconBadge(el, desc) {
  if (!el || !desc) return;
  el.className = `badge badge-icon ${desc.badge || desc.cls || 'badge-default'}`;
  el.removeAttribute('data-i18n');
  el.innerHTML = `<i class="ph ${desc.icon}"></i><span data-i18n="${desc.key}">${t(desc.key)}</span>`;
}

// ── Container-less chip: thematic-coloured text + DUOTONE icon.
// Used for in-row, read-only fields. The chip's `.row-chip` CSS owns the
// font-size + weight; duotone gives the icons a slightly softer look so
// they don't compete with the text against a plain row background.
function renderRowChip(el, desc) {
  if (!el || !desc) return;
  el.className = `row-chip ${desc.chip || 'chip-default'}`;
  el.removeAttribute('data-i18n');
  el.innerHTML = `<span data-i18n="${desc.key}">${t(desc.key)}</span><i class="ph-duotone ${desc.icon}"></i>`;
}

function fmtBytes(n) {
  if (!n) return '—';
  const mb = n / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(n / 1024).toFixed(0)} KB`;
}
function orgTypeLabel(occupation) {
  return t(`profile.org_type_${occupation}`) || occupation || '—';
}
function osIcon(os) {
  if (!os) return 'ph-monitor';
  const s = os.toLowerCase();
  if (s.includes('windows')) return 'ph-windows-logo';
  if (s.includes('mac'))     return 'ph-apple-logo';
  if (s.includes('linux'))   return 'ph-linux-logo';
  if (s.includes('android')) return 'ph-android-logo';
  if (s.includes('ios'))     return 'ph-apple-logo';
  return 'ph-monitor';
}

let _userPermissions = {};
let _orgData         = null;

function setVerifiedPill(spanEl, isVerified) {
  if (!spanEl) return;
  const cls = isVerified ? 'verified' : 'unverified';
  spanEl.className = `badge profile-verify-badge ${cls}`;
  const key = isVerified ? 'profile.verified' : 'profile.unverified';
  spanEl.setAttribute('data-i18n', key);
  spanEl.textContent = t(key);
}

async function loadProfile() {
  try {
    const resp  = await profile.get();
    const user  = resp.data?.user         ?? resp.data;
    const org   = resp.data?.organization ?? null;
    const perms = resp.data?.permissions  ?? {};
    _userProfile        = user;
    _userPermissions    = perms;
    _orgData            = org;
    _availableContacts  = Array.isArray(resp.data?.available_contacts)
      ? resp.data.available_contacts
      : [];

    const role     = user.org_role || user.role;
    const isOwner  = role === 'owner';
    const canEditOrg = !!perms.can_edit_organization;
    const canEditLim = !!perms.can_edit_limits;
    const hasOrg     = !!org && user.membership_status === 'approved';

    // ── Navbar mini-avatar + dropdown identity block ───────────
    setAvatar(q('#nav-avatar-initials'), q('#nav-avatar-img'), user);
    q('#dd-name').textContent  = user.full_name || '—';
    q('#dd-email').textContent = user.email_masked || user.phone_masked || '—';

    // Org row in the dropdown: name + role-or-status pill, clickable → #org.
    // Approved members get the role pill (gold/teal/etc.). Pending/rejected/
    // suspended/no-org users get the status pill so they understand WHY the
    // dashboard might be limited.
    const ddOrgEl  = q('#dd-org');
    const ddPillEl = q('#dd-pill');
    if (ddOrgEl)  ddOrgEl.textContent = org?.name || '—';
    if (ddPillEl) {
      if (hasOrg && role) {
        renderRowChip(ddPillEl, roleBadgeDescriptor(role));
      } else {
        renderRowChip(ddPillEl, statusBadge(user.membership_status));
      }
    }
    // Hide the org link entirely when there is no org row to navigate to.
    const ddOrgLink = q('#dd-org-link');
    if (ddOrgLink) ddOrgLink.style.display = hasOrg ? '' : 'none';

    updateWelcome(user);

    // ── Profile-tab IDENTITY STRIP ─────────────────────────────
    setAvatar(q('#profile-initials'), q('#profile-avatar-img'), user);
    q('#profile-fullname').textContent      = user.full_name || '—';
    q('#profile-userid-inline').textContent = `#${user.id ?? '—'}`;
    q('#profile-head-email').textContent    = user.email_masked || '';
    q('#profile-head-phone').textContent    = user.phone_masked || '';

    // Role + status pills — both use the icon+text badge style
    renderIconBadge(q('#profile-role-badge'), roleBadgeDescriptor(role));
    const statusEl = q('#profile-status-badge');
    if (statusEl) {
      if (isOwner) {
        statusEl.style.display = 'none';
      } else {
        statusEl.style.display = '';
        renderIconBadge(statusEl, statusBadge(user.membership_status));
      }
    }

    // ── Profile-tab LEFT card: Личные данные ───────────────────
    q('#info-fullname').textContent = user.full_name  || '—';
    q('#info-dept').textContent     = user.department || '—';
    // Role inside «Личные данные»: container-less chip (read-only info).
    renderRowChip(q('#info-role'), roleBadgeDescriptor(role));

    // Role-tooltip:
    //   owner   → hidden (nothing useful to say)
    //   manager → shown with the "you can change technician/employee" hint
    //   other   → shown with the generic "ask your owner/manager" hint
    const roleTipPersonal = q('#info-role-tooltip');
    if (roleTipPersonal) {
      let tipKey = null;
      if (role === 'manager')       tipKey = 'profile.role_change_hint_manager';
      else if (role !== 'owner')    tipKey = 'profile.role_change_hint';
      if (tipKey) {
        roleTipPersonal.classList.remove('hidden');
        roleTipPersonal.setAttribute('data-tooltip-key', tipKey);
        roleTipPersonal.setAttribute('data-tooltip-text', t(tipKey));
      } else {
        roleTipPersonal.classList.add('hidden');
      }
    }

    // Contacts: masked value as sub-line under label, action button on right.
    // The button flips between "Сменить" (gray) and "Привязать" (green)
    // depending on whether the user already has a contact of this type.
    // The dedicated "verified" pill is gone — verification is implied by
    // the fact that the contact is shown at all.
    const setRowAction = (btnEl, mode) => {
      if (!btnEl) return;
      btnEl.classList.remove('btn-row-change', 'btn-row-link');
      btnEl.classList.add(mode === 'link' ? 'btn-row-link' : 'btn-row-change');
    };

    const emailSub  = q('#info-email-sub');
    const emailBtn  = q('#btn-edit-email');
    const emailBtnL = q('#btn-edit-email-label');
    if (user.email_masked) {
      emailSub.textContent = user.email_masked;
      emailBtnL.setAttribute('data-i18n', 'common.change');
      emailBtnL.textContent = t('common.change');
      setRowAction(emailBtn, 'change');
    } else {
      emailSub.textContent = '';
      emailBtnL.setAttribute('data-i18n', 'common.link');
      emailBtnL.textContent = t('common.link');
      setRowAction(emailBtn, 'link');
    }

    const phoneSub  = q('#info-phone-sub');
    const phoneBtn  = q('#btn-edit-phone');
    const phoneBtnL = q('#btn-edit-phone-label');
    if (user.phone_masked) {
      phoneSub.textContent = user.phone_masked;
      phoneBtnL.setAttribute('data-i18n', 'common.change');
      phoneBtnL.textContent = t('common.change');
      setRowAction(phoneBtn, 'change');
    } else {
      phoneSub.textContent = '';
      phoneBtnL.setAttribute('data-i18n', 'common.link');
      phoneBtnL.textContent = t('common.link');
      setRowAction(phoneBtn, 'link');
    }

    // ── Profile-tab RIGHT card: Аккаунт ────────────────────────
    // Password + PIN dates render as a sub-line under their labels.
    const pwdSub = q('#info-pwd-changed');
    pwdSub.textContent = user.updated_at ? `${t('profile.password_last_changed')}: ${fmtDate(user.updated_at)}` : '—';
    const pinSub = q('#info-pin-set');
    pinSub.textContent = user.pin_set_at ? `${t('profile.pin_last_changed')}: ${fmtDate(user.pin_set_at)}` : '—';
    q('#info-created-at').textContent = fmtDate(user.created_at);
    q('#info-last-login').textContent = fmtDate(user.last_login);
    q('#info-joined').textContent     = isOwner ? fmtDate(org?.created_at) : fmtDate(user.updated_at);

    // ── ORG TAB visibility — only when approved member of an org ──
    const navItemOrg = q('#nav-item-org');
    if (navItemOrg) navItemOrg.style.display = hasOrg ? '' : 'none';
    if (!hasOrg && currentTab === 'org') switchTab('profile', { updateHash: true });

    // Sidebar Organization section (Members + Your-Org) — appears if
    // user is at least an approved member; specific items inside have
    // their own permission filters.
    const canManage = ['owner', 'manager'].includes(role);
    q('#org-nav-section').style.display = hasOrg ? '' : 'none';
    q('#nav-item-members').style.display = (hasOrg && canManage) ? '' : 'none';
    q('#no-org-notice')?.classList.toggle('hidden', hasOrg);

    // ── Populate the «Ваша организация» tab ────────────────────
    if (hasOrg && org) populateOrgTab(org, role, canEditOrg, canEditLim);

    // ── Tooltip text injection (CSS reads data-tooltip-text) ───
    document.querySelectorAll('[data-tooltip-key]').forEach(el => {
      el.setAttribute('data-tooltip-text', t(el.dataset.tooltipKey));
    });

    loadNotificationCount();

  } catch (err) {
    toast(errorMessage(err), 'error');
  }
}

// Helper: render an "Разрешено/Запрещено" feature flag as a row chip
// (text + duotone icon, no container) — matches the rest of the read-only
// rows in the Лимиты organizational card.
function setFeaturePill(el, allowed) {
  if (!el) return;
  const desc = allowed
    ? { key: 'profile.feature_allowed', chip: 'chip-allowed', icon: 'ph-check-circle' }
    : { key: 'profile.feature_denied',  chip: 'chip-denied',  icon: 'ph-prohibit'    };
  renderRowChip(el, desc);
}

// Renders all fields specific to the «Ваша организация» tab.
function populateOrgTab(org, role, canEditOrg, canEditLim) {
  // ── Header strip ────────────────────────────────────────────
  q('#org-head-name').textContent = org.name || '—';
  q('#org-head-id').textContent   = `#${org.id}`;
  // Per spec: header shows the current TARIFF (subscription plan), not
  // member count. Member count lives in the Подписка card.
  q('#org-head-plan').textContent = org.subscription_purchased ? 'Pro' : 'Free';

  renderIconBadge(q('#org-head-type'),   orgTypeBadge(org.occupation));
  renderIconBadge(q('#org-head-active'), orgStatusBadge(org.is_active));
  renderIconBadge(q('#org-head-myrole'), roleBadgeDescriptor(role));

  // ── Logo ────────────────────────────────────────────────────
  const logoImg  = q('#org-logo-img');
  const logoIni  = q('#org-logo-initials');
  const logoWrap = q('#org-logo-wrap');
  const logoOvr  = q('#org-logo-overlay');
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
  renderRowChip(q('#org-info-type'),   orgTypeBadge(org.occupation));
  renderRowChip(q('#org-info-status'), orgStatusBadge(org.is_active));
  renderRowChip(q('#org-info-myrole'), roleBadgeDescriptor(role));
  q('#org-info-created').textContent = fmtDate(org.created_at);

  // Role-change tooltip (same logic as on the Profile tab)
  const roleTipOrg = q('#org-info-role-tooltip');
  if (roleTipOrg) {
    let tipKey = null;
    if (role === 'manager')    tipKey = 'profile.role_change_hint_manager';
    else if (role !== 'owner') tipKey = 'profile.role_change_hint';
    if (tipKey) {
      roleTipOrg.classList.remove('hidden');
      roleTipOrg.setAttribute('data-tooltip-key', tipKey);
      roleTipOrg.setAttribute('data-tooltip-text', t(tipKey));
    } else {
      roleTipOrg.classList.add('hidden');
    }
  }

  // ── Subscription + counters ────────────────────────────────
  q('#sub-plan-line').textContent = org.subscription_purchased ? 'Pro' : 'Free';
  q('#sub-employee-usage').textContent  = org.limits ? `${org.current_employee_count ?? 0} / ${org.limits.max_employees}` : '—';
  // Active-request usage placeholder — counts of active requests are not
  // tracked yet in the API; show 0 until the requests endpoint reports it.
  q('#sub-active-req-usage').textContent = org.limits ? `0 / ${org.limits.max_active_requests}` : '—';

  // ── Limits card: pill on right + secondary "до N · X MB" sub ──
  if (org.limits) {
    const L = org.limits;
    setFeaturePill(q('#lim-images-flag'),    L.allow_image_uploads);
    setFeaturePill(q('#lim-videos-flag'),    L.allow_video_uploads);
    setFeaturePill(q('#lim-docs-flag'),      L.allow_document_uploads);
    setFeaturePill(q('#lim-analytics-flag'), L.has_analytics);
    setFeaturePill(q('#lim-export-flag'),    L.has_export);

    // Sub-lines: "до N шт./заявку · X MB" — both prefix and unit go through
    // i18n so the line gets a proper English translation ("up to N pcs.").
    const perReq  = t('profile.per_request');
    const upTo    = t('profile.up_to');
    const pcsUnit = t('profile.pcs_unit');
    q('#lim-images-sub').textContent =
      `${upTo} ${L.max_photo_per_request} ${pcsUnit}${perReq} · ${fmtBytes(L.max_image_upload_size_bytes)}`;
    q('#lim-videos-sub').textContent =
      `${upTo} ${L.max_videos_per_request} ${pcsUnit}${perReq} · ${fmtBytes(L.max_video_upload_size_bytes)} · ${L.max_video_duration_seconds}${t('profile.seconds_short')}`;
    q('#lim-docs-sub').textContent =
      `${upTo} ${L.max_document_per_request} ${pcsUnit}${perReq} · ${fmtBytes(L.max_document_upload_size_bytes)}`;

    // ── SLA values ─────────────────────────────────────────────
    q('#sla-crit').textContent = `${L.internal_sla_critical_h} ${t('profile.hours_short')}`;
    q('#sla-high').textContent = `${L.internal_sla_high_h} ${t('profile.hours_short')}`;
    q('#sla-med').textContent  = `${L.internal_sla_medium_h} ${t('profile.hours_short')}`;
    q('#sla-low').textContent  = `${L.internal_sla_low_h} ${t('profile.hours_short')}`;
  }

  // ── Show/hide edit-pencils based on permissions ────────────
  document.querySelectorAll('#tab-org .profile-row-edit-btn').forEach(btn => {
    const field = btn.dataset.editField;
    const isSlaField = field && field.startsWith('internal_sla_');
    btn.style.display = (isSlaField ? canEditLim : canEditOrg) ? '' : 'none';
  });
}

function updateWelcome(user) {
  const lang  = getLang();
  const first = (user?.full_name || '').split(' ')[0] || (lang === 'en' ? 'there' : '');
  const greeting = lang === 'en'
    ? `Welcome, ${first}!`
    : `Добро пожаловать, ${first}!`;
  const el = q('#welcome-title');
  if (el) el.textContent = greeting;
}

function setAvatar(initialsEl, imgEl, user) {
  if (!initialsEl) return;
  // Backend shape: user.avatar = { id, url } | null. We also keep the
  // legacy `avatar_url` flat field as a fallback for any older payloads.
  // Append a cache-buster derived from the media id so the <img> reloads
  // the new file even when the URL itself didn't change.
  const baseUrl = user?.avatar?.url || user?.avatar_url || '';
  if (baseUrl) {
    const v   = user?.avatar?.id ?? user?.updated_at ?? Date.now();
    const sep = baseUrl.includes('?') ? '&' : '?';
    initialsEl.style.display = 'none';
    if (imgEl) { imgEl.src = `${baseUrl}${sep}v=${encodeURIComponent(v)}`; imgEl.style.display = ''; }
  } else {
    initialsEl.style.display = '';
    initialsEl.textContent = initials(user?.full_name || user?.email_masked || user?.email || '?');
    if (imgEl) { imgEl.style.display = 'none'; imgEl.src = ''; }
  }
}

function initials(name) {
  return String(name).split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('') || '?';
}

function roleLabel(role) {
  return t(`roles.${role}`) || role || '—';
}

// ─────────────────────────────────────────────────────────────────
// AVATAR UPLOAD — uses the shared media-attach controller (see
// frontend/js/media-attach.js). Same preview/confirm flow used by
// the org logo, so both widgets share the modal styling and the
// pick → preview → confirm pipeline.
// ─────────────────────────────────────────────────────────────────
wireMediaAttach({
  input:       '#avatar-input',
  trigger:     '#btn-change-avatar',
  entityType:  'user',
  confirm:     (mediaFileId) => profile.confirmAvatar(mediaFileId),
  onSuccess:   () => {
    toast(getLang() === 'en' ? 'Avatar updated' : 'Фото обновлено', 'ok');
    loadProfile();
  },
  titleKey: 'profile.media_avatar_title',
  hintKey:  'profile.media_avatar_hint',
  cropPreview: 'circle',         // avatar is rendered as a circle
  t, toast, errorMessage,
});

// ─────────────────────────────────────────────────────────────────
// CHANGE PASSWORD (modal-based)
// ─────────────────────────────────────────────────────────────────
// openModal / closeModal already declared above (line ~109).
// Close-button + backdrop wiring is also set up earlier in the file
// (modal-close + modal-backdrop click handlers).

// ── Step-up verification state for the change-password modal ─────
//   • _chpVerifyTarget — the FULL contact value (email/phone) selected.
//   • _chpResendTimer  — interval id for the resend cooldown.
//   • Cleared each time the modal opens.
let _chpVerifyTarget = null;
let _chpVerifyType   = null;     // 'email' | 'phone'
let _chpResendTimer  = null;

function chpReadCode() {
  return [...document.querySelectorAll('.chp-code-input')].map(i => i.value).join('');
}
function chpClearCode() {
  document.querySelectorAll('.chp-code-input').forEach(i => {
    i.value = '';
    i.classList.remove('filled', 'error');
  });
}
function chpStartResendTimer(seconds = 60) {
  if (_chpResendTimer) clearInterval(_chpResendTimer);
  let left = Math.max(1, Math.ceil(seconds));
  const wait     = q('#chp-resend-wait');
  const btn      = q('#btn-chp-resend');
  const counter  = q('#chp-resend-countdown');
  if (wait)    wait.classList.remove('hidden');
  if (btn)     btn.style.display = 'none';
  if (counter) counter.textContent = left;
  _chpResendTimer = setInterval(() => {
    left--;
    if (counter) counter.textContent = left;
    if (left <= 0) {
      clearInterval(_chpResendTimer); _chpResendTimer = null;
      if (wait) wait.classList.add('hidden');
      if (btn)  btn.style.display = '';
    }
  }, 1000);
}

function chpSelectContact(typeOrEntry) {
  // typeOrEntry is either an available_contacts entry (object) or a string type.
  const entry = typeof typeOrEntry === 'object'
    ? typeOrEntry
    : _availableContacts.find(c => c.type === typeOrEntry);
  if (!entry) return;
  _chpVerifyType   = entry.type;
  _chpVerifyTarget = entry.value;

  // Reflect selection in the radio buttons (no-op if hidden).
  const radio = document.querySelector(`#chp-contact-choice input[name="chp-contact"][value="${entry.type}"]`);
  if (radio) radio.checked = true;
  document.querySelectorAll('#chp-contact-choice .role-card').forEach(card => {
    const r = card.querySelector('input[name="chp-contact"]');
    card.classList.toggle('selected', !!r?.checked);
  });
}

async function chpSendCode() {
  if (!_chpVerifyTarget || !_chpVerifyType) {
    showAlertText('err-chp', 'err-chp-text', t('errors.required'));
    return;
  }
  const btn = q('#btn-chp-send-code');
  setLoading(btn, true);
  try {
    await profile.sendCode({
      target:  _chpVerifyTarget,
      type:    _chpVerifyType,
      purpose: 'change_password',
    });
    q('#chp-code-row')?.classList.remove('hidden');
    chpClearCode();
    chpStartResendTimer(60);
    document.querySelector('.chp-code-input')?.focus();
    toast(t('profile.change_pwd_code_sent') || 'Код отправлен', 'ok');
  } catch (err) {
    showAlertText('err-chp', 'err-chp-text', errorMessage(err));
  } finally {
    setLoading(btn, false);
  }
}

q('#btn-open-change-pwd')?.addEventListener('click', () => {
  // Reset form state
  ['chp-current', 'chp-new', 'chp-confirm'].forEach(id => {
    const el = q('#' + id);
    if (el) el.value = '';
  });
  hideAlertById('err-chp');
  clearFieldErrorById('err-chp-current');
  clearFieldErrorById('err-chp-new');
  clearFieldErrorById('err-chp-confirm');
  // Reset strength meter
  q('#chp-strength').style.display = 'none';
  document.querySelectorAll('#chp-strength .pw-bar').forEach(b => { b.style.background = 'var(--clr-border)'; });
  const lbl = q('#chp-strength-label');
  if (lbl) lbl.textContent = '';

  // ── Step-up verification setup ────────────────────────────────
  // Reset previous selection + code inputs.
  _chpVerifyTarget = null;
  _chpVerifyType   = null;
  chpClearCode();
  q('#chp-code-row')?.classList.add('hidden');
  if (_chpResendTimer) { clearInterval(_chpResendTimer); _chpResendTimer = null; }
  q('#chp-resend-wait')?.classList.add('hidden');
  const resendBtn = q('#btn-chp-resend');
  if (resendBtn) resendBtn.style.display = '';

  // Populate the contact picker / single-target label from _availableContacts.
  const choice  = q('#chp-contact-choice');
  const single  = q('#chp-contact-single');
  const emailC  = _availableContacts.find(c => c.type === 'email');
  const phoneC  = _availableContacts.find(c => c.type === 'phone');
  const both    = !!emailC && !!phoneC;

  if (both) {
    if (choice) choice.style.display = '';
    if (single) single.style.display = 'none';
    q('#chp-contact-email-label').textContent = emailC.masked;
    q('#chp-contact-phone-label').textContent = phoneC.masked;
    // Don't auto-select — make the user pick (form-guard greys "Send code").
    document.querySelectorAll('#chp-contact-choice input[name="chp-contact"]').forEach(r => { r.checked = false; });
    document.querySelectorAll('#chp-contact-choice .role-card').forEach(c => c.classList.remove('selected'));
  } else if (emailC || phoneC) {
    if (choice) choice.style.display = 'none';
    if (single) single.style.display = '';
    const entry = emailC || phoneC;
    q('#chp-contact-single-target').textContent = entry.masked;
    chpSelectContact(entry);
  } else {
    // Edge case: no verified contacts (shouldn't happen — registration
    // verifies at least one). Hide both blocks and let backend reject.
    if (choice) choice.style.display = 'none';
    if (single) single.style.display = 'none';
  }

  openModal('change-pwd-modal');
  changePwdGuard.refresh();
});

// Radio cards in the contact picker — wire selection.
document.querySelectorAll('#chp-contact-choice input[name="chp-contact"]').forEach(r => {
  r.addEventListener('change', () => {
    if (r.checked) chpSelectContact(r.value);
    changePwdGuard.refresh();
  });
});

q('#btn-chp-send-code')?.addEventListener('click', chpSendCode);
q('#btn-chp-resend')?.addEventListener('click', chpSendCode);

// Wire the 6 code inputs: auto-advance, paste, backspace.
(function wireChpCodeInputs() {
  const inputs = [...document.querySelectorAll('.chp-code-input')];
  inputs.forEach((input, idx) => {
    input.addEventListener('input', () => {
      input.classList.remove('error');
      input.value = input.value.replace(/\D/, '').slice(0, 1);
      input.classList.toggle('filled', !!input.value);
      if (input.value && idx < inputs.length - 1) inputs[idx + 1].focus();
      changePwdGuard.refresh();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !input.value && idx > 0) {
        inputs[idx - 1].focus();
        inputs[idx - 1].value = '';
        inputs[idx - 1].classList.remove('filled');
        changePwdGuard.refresh();
      }
    });
    input.addEventListener('paste', (e) => {
      const raw = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
      if (!raw) return;
      e.preventDefault();
      [...raw].forEach((ch, i) => { if (inputs[i]) { inputs[i].value = ch; inputs[i].classList.add('filled'); } });
      inputs[Math.min(raw.length, inputs.length) - 1]?.focus();
      changePwdGuard.refresh();
    });
  });
})();

// Generic show/hide password toggle. Any [data-toggle-pw="<input id>"]
// button flips the target input between type=password and type=text and
// swaps the eye icon. Used by every change-password / change-pin form.
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-toggle-pw]');
  if (!btn) return;
  const input = document.getElementById(btn.dataset.togglePw);
  if (!input) return;
  const showing = input.type === 'text';
  input.type = showing ? 'password' : 'text';
  const icon = btn.querySelector('i');
  if (icon) icon.className = showing ? 'ph ph-eye' : 'ph ph-eye-slash';
});

// Live password-strength meter — same scheme as registration step 3:
// 0 chars → hidden; otherwise 4 bars fill green→red based on rule count.
function calcPwdStrength(pw) {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 8)    s++;
  if (/[A-Z]/.test(pw))  s++;
  if (/[a-z]/.test(pw))  s++;
  if (/\d/.test(pw))     s++;
  return Math.max(1, s);
}
q('#chp-new')?.addEventListener('input', () => {
  const pw       = q('#chp-new').value;
  const strength = calcPwdStrength(pw);
  const bars     = document.querySelectorAll('#chp-strength .pw-bar');
  const colors   = ['#ef4444', '#f59e0b', '#0d9488', '#0f766e'];
  const labels_ru = ['Очень слабый', 'Слабый', 'Хороший', 'Надёжный'];
  const labels_en = ['Very weak', 'Weak', 'Good', 'Strong'];
  const labels    = getLang() === 'en' ? labels_en : labels_ru;
  q('#chp-strength').style.display = pw ? '' : 'none';
  bars.forEach((bar, i) => {
    bar.style.background = i < strength ? colors[strength - 1] : 'var(--clr-border)';
  });
  const lbl = q('#chp-strength-label');
  if (lbl) { lbl.textContent = pw ? labels[strength - 1] : ''; lbl.style.color = colors[strength - 1]; }
});

q('#btn-save-pwd')?.addEventListener('click', async () => {
  const oldPw  = q('#chp-current')?.value ?? '';
  const newPw  = q('#chp-new')?.value ?? '';
  const newPw2 = q('#chp-confirm')?.value ?? '';
  const code   = chpReadCode();

  hideAlertById('err-chp');
  clearFieldErrorById('err-chp-current');
  clearFieldErrorById('err-chp-new');
  clearFieldErrorById('err-chp-confirm');

  let valid = true;
  if (!oldPw)  { setFieldError('err-chp-current', t('errors.required')); valid = false; }
  if (!newPw)  { setFieldError('err-chp-new',     t('errors.required')); valid = false; }
  if (!newPw2) { setFieldError('err-chp-confirm', t('errors.required')); valid = false; }
  if (!valid) return;

  if (newPw.length < 8 || !/[A-Z]/.test(newPw) || !/[a-z]/.test(newPw) || !/\d/.test(newPw)) {
    setFieldError('err-chp-new', t('errors.password_weak'));
    return;
  }
  if (newPw !== newPw2) {
    setFieldError('err-chp-confirm', t('errors.password_mismatch'));
    return;
  }

  // Step-up verification is required: the user must have entered a 6-digit
  // code received at one of their verified contacts.
  if (code.length !== 6 || !_chpVerifyTarget) {
    showAlertText('err-chp', 'err-chp-text', t('profile.change_pwd_need_verification') || t('errors.verification.code_not_found'));
    return;
  }

  const btn = q('#btn-save-pwd');
  setLoading(btn, true);
  try {
    await profile.changePassword({
      old_password: oldPw,
      new_password: newPw,
      new_password_confirm: newPw2,
      verification_code:   code,
      verification_target: _chpVerifyTarget,
    });
    toast(getLang() === 'en' ? 'Password changed' : 'Пароль изменён', 'ok');
    closeModal('change-pwd-modal');
    loadProfile();          // refresh last-changed timestamps
  } catch (err) {
    showAlertText('err-chp', 'err-chp-text', errorMessage(err));
  } finally {
    setLoading(btn, false);
  }
});

// ─────────────────────────────────────────────────────────────────
// CHANGE PIN (modal-based, three 6-digit groups)
// ─────────────────────────────────────────────────────────────────

function wirePinGroup(rootSel) {
  const inputs = [...document.querySelectorAll(`${rootSel} .pin-input`)];
  inputs.forEach((input, idx) => {
    input.addEventListener('input', () => {
      input.value = input.value.replace(/\D/, '').slice(0, 1);
      input.classList.toggle('filled', !!input.value);
      if (input.value && idx < inputs.length - 1) inputs[idx + 1].focus();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !input.value && idx > 0) {
        inputs[idx - 1].focus();
        inputs[idx - 1].value = '';
        inputs[idx - 1].classList.remove('filled');
      }
    });
    input.addEventListener('paste', (e) => {
      const raw = (e.clipboardData || window.clipboardData)
        .getData('text').replace(/\D/g, '').slice(0, inputs.length);
      if (!raw) return;
      e.preventDefault();
      [...raw].forEach((ch, i) => { if (inputs[i]) { inputs[i].value = ch; inputs[i].classList.add('filled'); } });
      inputs[Math.min(raw.length, inputs.length) - 1]?.focus();
    });
  });
  return inputs;
}

const pinCurInputs = wirePinGroup('#chpin-current');
const pinNewInputs = wirePinGroup('#chpin-new');
const pinCfmInputs = wirePinGroup('#chpin-confirm');

function readDigits(inputs) { return inputs.map(i => i.value).join(''); }
function clearDigits(inputs) {
  inputs.forEach(i => { i.value = ''; i.classList.remove('filled'); });
}

q('#btn-open-change-pin')?.addEventListener('click', () => {
  // If user doesn't yet have a PIN, hide the "current PIN" group entirely.
  const hasPin = !!_userProfile?.has_pin;
  q('#chpin-current-group')?.style.setProperty('display', hasPin ? '' : 'none');
  [pinCurInputs, pinNewInputs, pinCfmInputs].forEach(clearDigits);
  hideAlertById('err-chpin');
  openModal('change-pin-modal');
  (hasPin ? pinCurInputs[0] : pinNewInputs[0])?.focus();
  // Modal just rendered — recompute gray-look (hidden current-group, empty digits)
  changePinGuard.refresh();
});

q('#btn-save-pin')?.addEventListener('click', async () => {
  hideAlertById('err-chpin');
  const hasPin = !!_userProfile?.has_pin;
  const current = hasPin ? readDigits(pinCurInputs) : null;
  const fresh   = readDigits(pinNewInputs);
  const confirm = readDigits(pinCfmInputs);

  if (hasPin && current.length !== 6) {
    return showAlertText('err-chpin', 'err-chpin-text', t('errors.required'));
  }
  if (fresh.length !== 6) {
    return showAlertText('err-chpin', 'err-chpin-text', t('errors.pin_length'));
  }
  if (fresh !== confirm) {
    return showAlertText('err-chpin', 'err-chpin-text', t('errors.validation.pin_mismatch') || 'PIN codes do not match');
  }

  const btn = q('#btn-save-pin');
  setLoading(btn, true);
  try {
    const payload = { pin: fresh, pin_confirm: confirm };
    if (current) payload.current_pin = current;
    await auth.setPin(payload);
    toast(getLang() === 'en' ? 'PIN updated' : 'PIN изменён', 'ok');
    closeModal('change-pin-modal');
    loadProfile();
  } catch (err) {
    showAlertText('err-chpin', 'err-chpin-text', errorMessage(err));
  } finally {
    setLoading(btn, false);
  }
});

// ─────────────────────────────────────────────────────────────────
// Helpers for modal field errors / alerts
// ─────────────────────────────────────────────────────────────────
function setFieldError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  const span = el.querySelector('span');
  if (span) span.textContent = msg;
  el.classList.add('show');
}
function clearFieldErrorById(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('show');
  const span = el.querySelector('span');
  if (span) span.textContent = '';
}
function showAlertText(alertId, textId, msg) {
  const a = document.getElementById(alertId);
  if (!a) return;
  a.classList.add('show');
  a.classList.remove('hidden');
  const t = document.getElementById(textId);
  if (t) t.textContent = msg;
}
function hideAlertById(id) {
  const a = document.getElementById(id);
  if (!a) return;
  a.classList.remove('show');
  a.classList.add('hidden');
}

// ─────────────────────────────────────────────────────────────────
// GENERIC SINGLE-FIELD EDIT MODAL
// ─────────────────────────────────────────────────────────────────
// Every editable row has [data-edit-field="<key>"]. Click → modal opens
// pre-filled with the current value, validates per descriptor, and on
// Save calls the matching API endpoint. Container layout in read mode
// never changes.

const FIELD_EDITORS = {
  // Personal profile fields
  full_name: {
    title:  'profile.name',
    type:   'text',
    max:    255,
    current: () => _userProfile?.full_name || '',
    save:    (val) => profile.update({ full_name: val }),
    successKey: 'profile.saved_personal',
  },
  department: {
    title:  'profile.department',
    type:   'text',
    max:    150,
    current: () => _userProfile?.department || '',
    save:    (val) => profile.update({ department: val }),
    successKey: 'profile.saved_personal',
  },
  // email + phone use dedicated [Сменить]/[Привязать] buttons that lead
  // through the verification-code wizard (not implemented yet — currently
  // those buttons just show a "coming soon" toast). They DO NOT use the
  // generic field-edit modal.

  // Org fields
  organization_name: {
    title:  'profile.organization',
    type:   'text',
    max:    255,
    current: () => _orgData?.name || '',
    save:    (val) => org.updateSettings({ organization_name: val }),
    successKey: 'profile.saved_org',
  },
  occupation: {
    title:  'profile.org_type',
    type:   'select',
    options: [
      { value: 'customer',   labelKey: 'profile.org_type_customer' },
      { value: 'contractor', labelKey: 'profile.org_type_contractor' },
    ],
    current: () => _orgData?.occupation || 'customer',
    save:    (val) => org.updateSettings({ occupation: val }),
    successKey: 'profile.saved_org',
  },

  // SLA fields
  internal_sla_critical_h: { title: 'profile.sla_critical', type: 'number', min: 1, max: 240, current: () => _orgData?.limits?.internal_sla_critical_h, save: (v) => org.updateLimits({ internal_sla_critical_h: v }), successKey: 'profile.sla_saved' },
  internal_sla_high_h:     { title: 'profile.sla_high',     type: 'number', min: 1, max: 240, current: () => _orgData?.limits?.internal_sla_high_h,     save: (v) => org.updateLimits({ internal_sla_high_h: v     }), successKey: 'profile.sla_saved' },
  internal_sla_medium_h:   { title: 'profile.sla_medium',   type: 'number', min: 1, max: 240, current: () => _orgData?.limits?.internal_sla_medium_h,   save: (v) => org.updateLimits({ internal_sla_medium_h: v   }), successKey: 'profile.sla_saved' },
  internal_sla_low_h:      { title: 'profile.sla_low',      type: 'number', min: 1, max: 240, current: () => _orgData?.limits?.internal_sla_low_h,      save: (v) => org.updateLimits({ internal_sla_low_h: v      }), successKey: 'profile.sla_saved' },
};

let _currentFieldKey = null;

// ─────────────────────────────────────────────────────────────────
// VISUAL FORM-GUARDS for modals.
//   • field-edit-modal: only one of text/number/select is visible —
//     the fn-predicate inspects whichever element is currently shown.
//   • change-pwd-modal: all three password fields are required.
//   • change-pin-modal: 3 PIN groups, but current-group can be hidden
//     for users who haven't set a PIN yet — skip in that case.
// guard.refresh() is called by openFieldEditModal/openChangePwd/etc.
// since toggling display:none doesn't trigger an input event.
// ─────────────────────────────────────────────────────────────────
const fieldEditGuard = wireFormGuard({
  button:   '#btn-field-edit-save',
  required: [{
    kind:  'fn',
    watch: ['#field-edit-input', '#field-edit-number', '#field-edit-select'],
    fn: () => {
      const txt = document.getElementById('field-edit-input');
      const num = document.getElementById('field-edit-number');
      const sel = document.getElementById('field-edit-select');
      if (txt && txt.style.display !== 'none') return !!txt.value.trim();
      if (num && num.style.display !== 'none') return num.value !== '' && !Number.isNaN(Number(num.value));
      if (sel && sel.style.display !== 'none') return !!sel.value;
      return false;
    },
  }],
});

const changePwdGuard = wireFormGuard({
  button:   '#btn-save-pwd',
  required: [
    { sel: '#chp-current', kind: 'text' },
    { sel: '#chp-new',     kind: 'text' },
    { sel: '#chp-confirm', kind: 'text' },
    // Step-up verification: a 6-digit code is required AND a contact must
    // be selected (so the backend knows whose code to match).
    {
      kind:  'fn',
      watch: ['.chp-code-input', '#chp-contact-choice input[name="chp-contact"]'],
      fn: () => {
        const code = [...document.querySelectorAll('.chp-code-input')].map(i => i.value).join('');
        return code.length === 6 && !!_chpVerifyTarget;
      },
    },
  ],
});

const changePinGuard = wireFormGuard({
  button:   '#btn-save-pin',
  required: [{
    kind:  'fn',
    watch: ['#chpin-current .pin-input', '#chpin-new .pin-input', '#chpin-confirm .pin-input'],
    fn: () => {
      const join = (sel) =>
        [...document.querySelectorAll(`${sel} .pin-input`)].map(i => i.value).join('');
      const newOk     = join('#chpin-new')     .length === 6;
      const confirmOk = join('#chpin-confirm') .length === 6;
      // Current PIN group may be hidden (user has no PIN yet) — skip in that case.
      // The group is hidden via inline display:none, so offsetParent is the
      // cleanest cross-display-mode check.
      const currentGroup = document.getElementById('chpin-current-group');
      const currentHidden = !currentGroup || currentGroup.offsetParent === null;
      const currentOk = currentHidden ? true : join('#chpin-current').length === 6;
      return newOk && confirmOk && currentOk;
    },
  }],
});

function openFieldEditModal(fieldKey) {
  const desc = FIELD_EDITORS[fieldKey];
  if (!desc) return;
  _currentFieldKey = fieldKey;

  q('#field-edit-title').textContent = t(desc.title);
  q('#field-edit-label').textContent = t(desc.title);
  const errEl = q('#field-edit-error');
  errEl.classList.remove('show');

  const txt = q('#field-edit-input');
  const num = q('#field-edit-number');
  const sel = q('#field-edit-select');
  txt.style.display = num.style.display = sel.style.display = 'none';

  const hint = q('#field-edit-hint');
  if (desc.hintKey) { hint.textContent = t(desc.hintKey); hint.classList.remove('hidden'); }
  else              { hint.classList.add('hidden'); }

  if (desc.type === 'number') {
    num.style.display = '';
    num.min = desc.min ?? '';
    num.max = desc.max ?? '';
    num.value = desc.current() ?? '';
  } else if (desc.type === 'select') {
    sel.style.display = '';
    sel.innerHTML = desc.options.map(o =>
      `<option value="${o.value}">${t(o.labelKey)}</option>`).join('');
    sel.value = desc.current();
  } else {
    txt.style.display = '';
    txt.maxLength = desc.max ?? 255;
    txt.value = desc.current() ?? '';
  }
  openModal('field-edit-modal');
  (desc.type === 'number' ? num : desc.type === 'select' ? sel : txt).focus();
  // After visibility swap, recompute the gray-look on the save button.
  fieldEditGuard.refresh();
}

document.querySelectorAll('[data-edit-field]').forEach(btn => {
  btn.addEventListener('click', () => openFieldEditModal(btn.dataset.editField));
});

q('#btn-field-edit-save')?.addEventListener('click', async () => {
  const desc = FIELD_EDITORS[_currentFieldKey];
  if (!desc) return;

  let value;
  if (desc.type === 'number') {
    value = Number(q('#field-edit-number').value);
    if (!Number.isInteger(value) || value < (desc.min ?? -Infinity) || value > (desc.max ?? Infinity)) {
      const err = q('#field-edit-error');
      err.querySelector('span').textContent = `${desc.min}–${desc.max}`;
      err.classList.add('show');
      return;
    }
  } else if (desc.type === 'select') {
    value = q('#field-edit-select').value;
  } else {
    value = q('#field-edit-input').value.trim();
    if (!value) {
      const err = q('#field-edit-error');
      err.querySelector('span').textContent = t('errors.required');
      err.classList.add('show');
      return;
    }
  }

  const btn = q('#btn-field-edit-save');
  setLoading(btn, true);
  try {
    await desc.save(value);
    if (!desc.skipSaveToast) toast(t(desc.successKey || 'profile.saved_generic'), 'ok');
    closeModal('field-edit-modal');
    await loadProfile();
  } catch (err) {
    if (err?.error_key === 'profile.telegram_coming_soon') {
      // Special-case: email/phone change not yet wired
      closeModal('field-edit-modal');
      toast('Скоро будет', 'info');
      return;
    }
    const errEl = q('#field-edit-error');
    errEl.querySelector('span').textContent = errorMessage(err);
    errEl.classList.add('show');
  } finally {
    setLoading(btn, false);
  }
});

// "Upgrade subscription" — coming-soon toast
q('#btn-upgrade-sub')?.addEventListener('click', (e) => {
  e.preventDefault();
  toast(t('profile.upgrade_coming_soon'), 'info');
});
// "Link Telegram" — coming-soon toast
q('#btn-link-telegram')?.addEventListener('click', (e) => {
  e.preventDefault();
  toast(t('profile.telegram_coming_soon'), 'info');
});
// Email / Phone change/link buttons → open the 3-step contact-change wizard.
q('#btn-edit-email')?.addEventListener('click', () => openChangeContactModal('email'));
q('#btn-edit-phone')?.addEventListener('click', () => openChangeContactModal('phone'));

// ─────────────────────────────────────────────────────────────────
// DETACH CONTACT — single-step proof: type the contact + the account
// password. Backend (POST /profile/detach-contact) refuses to detach
// the user's last verified contact. Sessions are NOT revoked — only
// password change triggers a system-wide logout.
// ─────────────────────────────────────────────────────────────────
let _dtcType = null;

function openDetachModal(type) {
  _dtcType = type;
  hideAlertById('err-dtc');
  clearFieldErrorById('err-dtc-contact');
  clearFieldErrorById('err-dtc-password');
  if (q('#dtc-contact'))  q('#dtc-contact').value  = '';
  if (q('#dtc-password')) q('#dtc-password').value = '';
  const titleKey = type === 'email' ? 'profile.detach_email' : 'profile.detach_phone';
  q('#dtc-title').setAttribute('data-i18n', titleKey);
  q('#dtc-title').textContent = t(titleKey);
  closeModal('change-contact-modal');
  openModal('detach-contact-modal');
  setTimeout(() => q('#dtc-contact')?.focus(), 80);
}

// "Назад" inside the detach modal — return to the change-contact wizard
// (where the user originally clicked the trash link).
q('#btn-dtc-back')?.addEventListener('click', () => {
  closeModal('detach-contact-modal');
  if (_dtcType) openChangeContactModal(_dtcType);
});

q('#btn-dtc-submit')?.addEventListener('click', async () => {
  hideAlertById('err-dtc');
  clearFieldErrorById('err-dtc-contact');
  clearFieldErrorById('err-dtc-password');

  if (!_dtcType) return;
  const contact = (q('#dtc-contact')?.value || '').trim();
  const pwd     =  q('#dtc-password')?.value || '';

  let valid = true;
  if (!contact) { setFieldError('err-dtc-contact',  t('errors.required')); valid = false; }
  if (!pwd)     { setFieldError('err-dtc-password', t('errors.required')); valid = false; }
  if (!valid) return;

  const btn = q('#btn-dtc-submit');
  setLoading(btn, true);
  try {
    await profile.detachContact({
      target_type:     _dtcType,
      current_contact: contact,
      password:        pwd,
    });
    closeModal('detach-contact-modal');
    toast(getLang() === 'en' ? 'Contact detached' : 'Контакт откреплён', 'ok');
    loadProfile();
  } catch (err) {
    // Surface contact-mismatch errors against the contact field so the
    // user knows what to fix.
    if (err?.error_key === 'profile.change_contact_current_mismatch') {
      setFieldError('err-dtc-contact', errorMessage(err));
    } else if (err?.error_key === 'errors.auth.invalid_credentials') {
      setFieldError('err-dtc-password', errorMessage(err));
    } else {
      showAlertText('err-dtc', 'err-dtc-text', errorMessage(err));
    }
  } finally {
    setLoading(btn, false);
  }
});

// "Открепить контакт" link inside the change-contact modal opens detach.
q('#btn-chc-detach')?.addEventListener('click', () => {
  if (_chcType) openDetachModal(_chcType);
});

// ─────────────────────────────────────────────────────────────────
// CHANGE CONTACT (email / phone) — 3-step wizard
//   • Step 1: confirm current contact (skipped when LINKING a new one).
//   • Step 2: enter the new contact and request a 6-digit code.
//   • Step 3: enter the code and submit. Backend revokes ALL sessions
//             on success, so we log the user out.
// Uses /api/profile/send-code with purpose=change_email|change_phone
// and the matching /api/profile/change-email / change-phone endpoints.
// ─────────────────────────────────────────────────────────────────
let _chcType   = null;         // 'email' | 'phone'
let _chcMode   = 'change';     // 'change' (has existing contact) | 'link'
let _chcStep   = 1;
let _chcNewValue = null;       // normalised new contact value
let _chcResendTimer = null;

function chcReadCode() {
  return [...document.querySelectorAll('.chc-code-input')].map(i => i.value).join('');
}
function chcClearCode() {
  document.querySelectorAll('.chc-code-input').forEach(i => {
    i.value = '';
    i.classList.remove('filled', 'error');
  });
}
function chcSetStep(step) {
  _chcStep = step;
  q('#chc-step1')?.classList.toggle('hidden', step !== 1);
  q('#chc-step2')?.classList.toggle('hidden', step !== 2);
  q('#chc-step3')?.classList.toggle('hidden', step !== 3);
  const backBtn = q('#btn-chc-back');
  const nextBtn = q('#btn-chc-next');
  if (backBtn) backBtn.style.display = step > 1 ? '' : 'none';
  if (nextBtn) {
    if (step === 1) {
      nextBtn.textContent = t('common.continue') || 'Далее';
      nextBtn.setAttribute('data-i18n', 'common.continue');
    } else if (step === 2) {
      nextBtn.textContent = t('profile.change_contact_send_code') || 'Отправить код';
      nextBtn.setAttribute('data-i18n', 'profile.change_contact_send_code');
    } else {
      nextBtn.textContent = t('common.save') || 'Сохранить';
      nextBtn.setAttribute('data-i18n', 'common.save');
    }
  }
  changeContactGuard.refresh();
}
function chcStartResendTimer(seconds = 60) {
  if (_chcResendTimer) clearInterval(_chcResendTimer);
  let left = Math.max(1, Math.ceil(seconds));
  const wait    = q('#chc-resend-wait');
  const btn     = q('#btn-chc-resend');
  const counter = q('#chc-resend-countdown');
  if (wait)    wait.classList.remove('hidden');
  if (btn)     btn.style.display = 'none';
  if (counter) counter.textContent = left;
  _chcResendTimer = setInterval(() => {
    left--;
    if (counter) counter.textContent = left;
    if (left <= 0) {
      clearInterval(_chcResendTimer); _chcResendTimer = null;
      if (wait) wait.classList.add('hidden');
      if (btn)  btn.style.display = '';
    }
  }, 1000);
}

function normaliseContactInput(type, raw) {
  const v = String(raw || '').trim();
  if (!v) return '';
  return type === 'email' ? v.toLowerCase() : v.replace(/[\s\-\(\)\.]/g, '');
}
function isValidEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s); }
function isValidPhone(s) { return /^\+?\d{10,15}$/.test(s); }

function openChangeContactModal(type) {
  _chcType   = type;
  _chcNewValue = null;
  hideAlertById('err-chc');
  clearFieldErrorById('err-chc-current');
  clearFieldErrorById('err-chc-new');
  chcClearCode();
  q('#chc-current-input').value = '';
  q('#chc-new-input').value     = '';
  if (_chcResendTimer) { clearInterval(_chcResendTimer); _chcResendTimer = null; }
  q('#chc-resend-wait')?.classList.add('hidden');
  const resendBtn = q('#btn-chc-resend');
  if (resendBtn) resendBtn.style.display = '';

  // Decide LINK vs CHANGE based on whether the user already has this contact.
  const hasIt = type === 'email' ? !!_userProfile?.has_email : !!_userProfile?.has_phone;
  _chcMode = hasIt ? 'change' : 'link';

  // Title + per-step copy.
  const titleKey = type === 'email'
    ? (_chcMode === 'change' ? 'profile.change_email' : 'profile.link_email')
    : (_chcMode === 'change' ? 'profile.change_phone' : 'profile.link_phone');
  q('#chc-title').textContent = t(titleKey);
  q('#chc-title').setAttribute('data-i18n', titleKey);

  // "Detach contact" link is visible only when:
  //   • we're in CHANGE mode (LINK doesn't have anything to detach), AND
  //   • the user has ANOTHER verified contact (else we'd strand them).
  const otherVerified = _chcType === 'email'
    ? (_userProfile?.has_phone && _userProfile?.phone_verified)
    : (_userProfile?.has_email && _userProfile?.email_verified);
  const detachRow = q('#chc-detach-row');
  if (detachRow) detachRow.style.display = (_chcMode === 'change' && otherVerified) ? '' : 'none';

  // If linking, we skip the confirm-current step — there's nothing to confirm.
  if (_chcMode === 'link') {
    chcSetStep(2);
  } else {
    chcSetStep(1);
  }

  openModal('change-contact-modal');
  setTimeout(() => {
    if (_chcStep === 1) q('#chc-current-input')?.focus();
    else q('#chc-new-input')?.focus();
  }, 80);
}

// ── STEP transitions handler ─────────────────────────────────────
async function chcNext() {
  hideAlertById('err-chc');

  if (_chcStep === 1) {
    // Validate that the user knows their current contact. The same
    // normaliser is applied to BOTH sides of the comparison so we don't
    // accidentally strip dots out of emails ("j.doe@example.com" must
    // not become "jdoe@examplecom" — that's a phone-only normalisation).
    const typed = normaliseContactInput(_chcType, q('#chc-current-input').value);
    if (!typed) { setFieldError('err-chc-current', t('errors.required')); return; }
    const entry = _availableContacts.find(c => c.type === _chcType);
    const stored = entry ? normaliseContactInput(_chcType, entry.value) : '';
    if (!entry || typed !== stored) {
      setFieldError('err-chc-current',
        t('profile.change_contact_current_mismatch') || t('errors.verification.code_invalid'));
      return;
    }
    chcSetStep(2);
    setTimeout(() => q('#chc-new-input')?.focus(), 80);
    return;
  }

  if (_chcStep === 2) {
    const newVal = normaliseContactInput(_chcType, q('#chc-new-input').value);
    if (!newVal) { setFieldError('err-chc-new', t('errors.required')); return; }
    const ok = _chcType === 'email' ? isValidEmail(newVal) : isValidPhone(newVal);
    if (!ok) {
      setFieldError('err-chc-new',
        _chcType === 'email' ? t('errors.invalid_contact') : t('errors.invalid_contact'));
      return;
    }
    // Don't allow setting to the existing value.
    const existing = _availableContacts.find(c => c.type === _chcType);
    if (existing && existing.value && newVal === String(existing.value).toLowerCase().replace(/[\s\-\(\)\.]/g, '')) {
      setFieldError('err-chc-new', t('errors.contact_same_as_current') || t('errors.validation.duplicate_data'));
      return;
    }
    _chcNewValue = newVal;

    const btn = q('#btn-chc-next');
    setLoading(btn, true);
    try {
      await profile.sendCode({
        target:  newVal,
        type:    _chcType,
        purpose: _chcType === 'email' ? 'change_email' : 'change_phone',
      });
      q('#chc-step3-target').textContent = newVal;
      chcSetStep(3);
      chcClearCode();
      chcStartResendTimer(60);
      setTimeout(() => document.querySelector('.chc-code-input')?.focus(), 80);
      toast(t('profile.change_pwd_code_sent') || 'Код отправлен', 'ok');
    } catch (err) {
      showAlertText('err-chc', 'err-chc-text', errorMessage(err));
    } finally {
      setLoading(btn, false);
    }
    return;
  }

  if (_chcStep === 3) {
    const code = chcReadCode();
    if (code.length !== 6) { showAlertText('err-chc', 'err-chc-text', t('errors.pin_length')); return; }

    const btn = q('#btn-chc-next');
    setLoading(btn, true);
    try {
      _chcType === 'email'
        ? await profile.changeEmail({ new_email: _chcNewValue, verification_code: code })
        : await profile.changePhone({ new_phone: _chcNewValue, verification_code: code });
      closeModal('change-contact-modal');
      toast(getLang() === 'en' ? 'Contact saved' : 'Контакт сохранён', 'ok');
      loadProfile();
    } catch (err) {
      showAlertText('err-chc', 'err-chc-text', errorMessage(err));
    } finally {
      setLoading(btn, false);
    }
  }
}
q('#btn-chc-next')?.addEventListener('click', chcNext);
q('#btn-chc-back')?.addEventListener('click', () => {
  if (_chcStep === 3)      chcSetStep(2);
  else if (_chcStep === 2 && _chcMode === 'change') chcSetStep(1);
});

q('#btn-chc-resend')?.addEventListener('click', async () => {
  if (!_chcNewValue) return;
  const btn = q('#btn-chc-resend');
  setLoading(btn, true);
  try {
    await profile.sendCode({
      target:  _chcNewValue,
      type:    _chcType,
      purpose: _chcType === 'email' ? 'change_email' : 'change_phone',
    });
    chcStartResendTimer(60);
    chcClearCode();
    document.querySelector('.chc-code-input')?.focus();
    toast(t('profile.change_pwd_code_sent') || 'Код отправлен', 'ok');
  } catch (err) {
    showAlertText('err-chc', 'err-chc-text', errorMessage(err));
  } finally {
    setLoading(btn, false);
  }
});

// Auto-advance/backspace for the 6 code inputs.
(function wireChcCodeInputs() {
  const inputs = [...document.querySelectorAll('.chc-code-input')];
  inputs.forEach((input, idx) => {
    input.addEventListener('input', () => {
      input.classList.remove('error');
      input.value = input.value.replace(/\D/, '').slice(0, 1);
      input.classList.toggle('filled', !!input.value);
      if (input.value && idx < inputs.length - 1) inputs[idx + 1].focus();
      changeContactGuard.refresh();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !input.value && idx > 0) {
        inputs[idx - 1].focus();
        inputs[idx - 1].value = '';
        inputs[idx - 1].classList.remove('filled');
        changeContactGuard.refresh();
      }
    });
    input.addEventListener('paste', (e) => {
      const raw = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
      if (!raw) return;
      e.preventDefault();
      [...raw].forEach((ch, i) => { if (inputs[i]) { inputs[i].value = ch; inputs[i].classList.add('filled'); } });
      inputs[Math.min(raw.length, inputs.length) - 1]?.focus();
      changeContactGuard.refresh();
    });
  });
})();

// Visual gray-out of the primary "Next / Send / Save" button until the
// active step's inputs are populated.
const changeContactGuard = wireFormGuard({
  button:   '#btn-chc-next',
  required: [{
    kind: 'fn',
    watch: ['#chc-current-input', '#chc-new-input', '.chc-code-input'],
    fn: () => {
      if (_chcStep === 1) {
        return !!q('#chc-current-input')?.value.trim();
      }
      if (_chcStep === 2) {
        return !!q('#chc-new-input')?.value.trim();
      }
      // Step 3
      const code = [...document.querySelectorAll('.chc-code-input')].map(i => i.value).join('');
      return code.length === 6;
    },
  }],
});

// ─────────────────────────────────────────────────────────────────
// ACTIVE SESSIONS (Profile tab)
// ─────────────────────────────────────────────────────────────────
// Token lives 30 days. Visualise remaining lifetime with a horizontal bar
// whose colour blends from the brand accent-green (full life) to error-red
// (about to expire). We interpolate the two literal hex values rather than
// HSL so the ramp matches the actual palette colours instead of an
// arbitrary spectrum slice.
function _hex2rgb(h) {
  const v = h.replace('#', '');
  return [parseInt(v.slice(0,2), 16), parseInt(v.slice(2,4), 16), parseInt(v.slice(4,6), 16)];
}
function _mixRgb(a, b, t) {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}
// Cache the resolved palette values so we don't getComputedStyle() every
// row render. Falls back to literal accent/error if CSS vars aren't yet
// readable (e.g. unit-test contexts).
let _accentRgb = null, _errorRgb = null;
function _palette() {
  if (_accentRgb && _errorRgb) return { accent: _accentRgb, error: _errorRgb };
  const cs = getComputedStyle(document.documentElement);
  const a  = cs.getPropertyValue('--clr-accent').trim() || '#0d9488';
  const e  = cs.getPropertyValue('--clr-error').trim()  || '#ef4444';
  _accentRgb = _hex2rgb(a.startsWith('#') ? a : '#0d9488');
  _errorRgb  = _hex2rgb(e.startsWith('#') ? e : '#ef4444');
  return { accent: _accentRgb, error: _errorRgb };
}
function tokenColorByDaysLeft(daysLeft) {
  const ratio = Math.max(0, Math.min(1, daysLeft / 30));   // 1=full life, 0=expired
  const { accent, error } = _palette();
  const [r, g, b] = _mixRgb(error, accent, ratio);          // 0 → error, 1 → accent
  return `rgb(${r}, ${g}, ${b})`;
}

function formatRemaining(expiresAt) {
  const ms   = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return { days: 0, hours: 0, label: '0' + t('profile.days_short') };
  const days  = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const label = days >= 1
    ? `${days}${t('profile.days_short')}`
    : `${hours}${t('profile.hours_short')}`;
  return { days, hours, label };
}

async function loadSessions() {
  const listEl = q('#sessions-list');
  const cntEl  = q('#sessions-count');
  if (!listEl) return;

  listEl.innerHTML = `<div class="empty-state" style="padding:1.5rem 0;">
    <i class="ph ph-spinner"></i>
    <p class="empty-state-text">${t('profile.sessions_loading')}</p>
  </div>`;

  try {
    const resp = await profile.sessions();
    const sessions = resp.data?.sessions ?? [];
    cntEl.textContent = `${sessions.length}`;

    if (!sessions.length) {
      listEl.innerHTML = `<div class="empty-state" style="padding:1.5rem 0;">
        <i class="ph ph-device-mobile"></i>
        <p class="empty-state-text">${t('profile.sessions_empty')}</p>
      </div>`;
      return;
    }

    listEl.innerHTML = sessions.map(s => {
      const left  = formatRemaining(s.token_expires_at);
      const color = tokenColorByDaysLeft(left.days + left.hours / 24);
      const pct   = Math.max(2, Math.min(100, ((left.days * 24 + left.hours) / (30 * 24)) * 100));
      // Single header line: OS in primary text, browser appended in muted
      // gray after a separator. Device hash falls back when both are unknown.
      // For the CURRENT session we promote the whole "icon + OS + browser"
      // block to success colour and attach a card-style tooltip — no extra
      // standalone icon. The OS icon's own treatment is preserved (same
      // glyph + size), only its colour inherits.
      const osLabel      = s.os      && s.os      !== 'Unknown' ? s.os      : '';
      const browserLabel = s.browser && s.browser !== 'Unknown' ? s.browser : '';
      const primary = osLabel || browserLabel || s.device_hash;
      const browserSpan = osLabel && browserLabel
        ? (s.is_current
            ? `<span style="font-weight:500; opacity:.85;"> · ${browserLabel}</span>`
            : `<span style="color:var(--clr-text-muted); font-weight:500;"> · ${browserLabel}</span>`)
        : '';
      const blockColor = s.is_current ? 'var(--clr-success)' : 'var(--clr-text-primary)';
      const iconColor  = s.is_current ? 'var(--clr-success)' : 'var(--clr-accent)';
      const tooltipAttrs = s.is_current
        ? `class="profile-card-tooltip session-current-block" tabindex="0" data-tooltip-text="${t('profile.session_current')}"`
        : '';
      return `
        <div class="profile-row" style="flex-direction:column; align-items:stretch; gap:.5rem;">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:.75rem;">
            <span ${tooltipAttrs} style="display:flex; align-items:center; gap:.6rem; min-width:0; color:${blockColor};">
              <i class="ph ${osIcon(s.os)}" style="color:${iconColor}; font-size:1.15rem;"></i>
              <span style="min-width:0; font-size:var(--text-sm); font-weight:600;">
                ${primary}${browserSpan}
              </span>
            </span>
            <span style="font-size:var(--text-sm); font-weight:600; color:${color}; white-space:nowrap;">${left.label}</span>
          </div>
          <div style="height:6px; background:var(--clr-bg-muted); border-radius:3px; overflow:hidden;">
            <div style="height:100%; width:${pct}%; background:${color}; transition:width .3s;"></div>
          </div>
          <div style="display:flex; gap:1rem; font-size:var(--text-xs); color:var(--clr-text-muted);">
            <span>${t('profile.session_last_used')}: ${new Date(s.last_used_at).toLocaleString(getLang() === 'en' ? 'en-GB' : 'ru-RU', { dateStyle: 'short', timeStyle: 'short' })}</span>
            <span>${t('profile.session_created')}: ${new Date(s.created_at).toLocaleString(getLang() === 'en' ? 'en-GB' : 'ru-RU', { dateStyle: 'short', timeStyle: 'short' })}</span>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    listEl.innerHTML = `<div class="empty-state" style="padding:1.5rem 0;">
      <i class="ph ph-warning-circle"></i>
      <p class="empty-state-text">${errorMessage(err)}</p>
    </div>`;
  }
}

// ─────────────────────────────────────────────────────────────────
// ORG PROFILE — populated by populateOrgTab() inside loadProfile();
// switchTab('org') just re-fetches /api/profile/me which carries the
// org payload already.
// ─────────────────────────────────────────────────────────────────
async function loadOrgProfile() {
  // Refresh to pick up any pending changes (e.g. someone else just
  // updated the org name) without leaving the user on stale data.
  await loadProfile();
}

// (legacy #btn-edit-org + #btn-save-org-name handlers removed —
//  org-name edits now go through the generic #field-edit-modal)

// Org logo — wired via the shared media-attach controller. Permission to
// trigger (clicking the wrap) is gated elsewhere by .editable on the
// wrapping element; the wireMediaAttach trigger here just hands the click
// through to the <input>.
wireMediaAttach({
  input:       '#org-logo-input',
  trigger:     '#org-logo-wrap.editable',
  entityType:  'organization',
  confirm:     (mediaFileId) => org.confirmLogo(mediaFileId),
  onSuccess:   () => {
    toast(getLang() === 'en' ? 'Logo updated' : 'Логотип обновлён', 'ok');
    loadOrgProfile();
  },
  titleKey: 'profile.media_logo_title',
  hintKey:  'profile.media_logo_hint',
  cropPreview: 'square',         // org logo is rendered as a square tile
  t, toast, errorMessage,
});

// ─────────────────────────────────────────────────────────────────
// NOTIFICATIONS
// ─────────────────────────────────────────────────────────────────
let _notifications = [];

async function loadNotificationCount() {
  try {
    const data = await notifications.getAll({ limit: 50 });
    const items = data.data || [];
    const unread = items.filter(n => !n.read_at).length;
    updateNotifBadge(unread);
  } catch (_) {}
}

async function loadNotifications() {
  try {
    const data = await notifications.getAll({ limit: 100 });
    _notifications = data.data || [];
    renderNotifications();
    renderOverviewNotifs();
    updateNotifBadge(_notifications.filter(n => !n.read_at).length);
  } catch (err) { toast(errorMessage(err), 'error'); }
}

function renderNotifications() {
  const list = q('#notif-list');
  if (!list) return;
  if (!_notifications.length) {
    list.innerHTML = `<div class="empty-state"><i class="ph ph-bell-slash"></i><p class="empty-state-text">${t('notifications.empty')}</p></div>`;
    return;
  }
  list.innerHTML = _notifications.map(notifItemHTML).join('');
  list.querySelectorAll('.notification-item').forEach((el, i) => {
    el.addEventListener('click', () => markNotifRead(_notifications[i]));
  });
}

function renderOverviewNotifs() {
  const el = q('#overview-notifs');
  if (!el) return;
  const recent = _notifications.slice(0, 5);
  if (!recent.length) {
    el.innerHTML = `<div class="empty-state" style="padding:2rem;"><i class="ph ph-bell-slash"></i><p class="empty-state-text">${t('notifications.empty')}</p></div>`;
    return;
  }
  el.innerHTML = recent.map(notifItemHTML).join('');
  el.querySelectorAll('.notification-item').forEach((el2, i) => {
    el2.addEventListener('click', () => markNotifRead(recent[i]));
  });
}

function notifItemHTML(n) {
  const unread = !n.read_at;
  const icon   = n.notification_type === 'success' ? 'ph-check-circle'
               : n.notification_type === 'warning' ? 'ph-warning'
               : n.notification_type === 'error'   ? 'ph-x-circle'
               : 'ph-info';
  const time   = formatRelativeTime(n.created_at);
  return `
    <div class="notification-item ${unread ? 'unread' : ''}" data-id="${n.id}">
      <div class="notification-icon"><i class="ph ${icon}"></i></div>
      <div class="notification-content">
        <p class="notification-text">${escapeHTML(n.message_text || '')}</p>
        <p class="notification-time">${time}</p>
      </div>
      ${unread ? '<div style="width:.5rem;height:.5rem;border-radius:50%;background:var(--clr-accent);flex-shrink:0;margin-top:.3rem;"></div>' : ''}
    </div>`;
}

async function markNotifRead(notif) {
  if (notif.read_at) return;
  try {
    await notifications.markRead(notif.id);
    notif.read_at = new Date().toISOString();
    renderNotifications();
    renderOverviewNotifs();
    updateNotifBadge(_notifications.filter(n => !n.read_at).length);
  } catch (_) {}
}

q('#btn-mark-all-read')?.addEventListener('click', async () => {
  const unread = _notifications.filter(n => !n.read_at);
  if (!unread.length) return;
  try {
    await notifications.markAllRead(unread.map(n => n.id));
    _notifications.forEach(n => { if (!n.read_at) n.read_at = new Date().toISOString(); });
    renderNotifications();
    renderOverviewNotifs();
    updateNotifBadge(0);
    toast(getLang() === 'en' ? 'All marked as read' : 'Все прочитаны', 'ok');
  } catch (err) { toast(errorMessage(err), 'error'); }
});

function updateNotifBadge(count) {
  const dot   = q('#notif-dot');
  const badge = q('#notif-badge');
  if (dot)   dot.style.display  = count > 0 ? '' : 'none';
  if (badge) {
    badge.textContent = count > 0 ? String(count) : '';
    badge.classList.toggle('hidden', count === 0);
  }
}

// ─────────────────────────────────────────────────────────────────
// MEMBERS
// ─────────────────────────────────────────────────────────────────
async function loadMembers() {
  try {
    const data = await members.listPending();
    const list = data.data || [];
    const section = q('#pending-section');
    const el      = q('#pending-list');
    if (!list.length) { if (section) section.style.display = 'none'; return; }
    if (section) section.style.display = '';
    if (!el) return;
    el.innerHTML = list.map(m => `
      <div class="notification-item" style="padding:.75rem 1rem; border-bottom:1px solid var(--clr-border);">
        <div class="avatar avatar-sm">${initials(m.full_name || m.contact || '?')}</div>
        <div class="notification-content">
          <p class="notification-text" style="font-weight:500;">${escapeHTML(m.full_name || m.contact || '—')}</p>
          <p class="notification-time">${roleLabel(m.requested_role)}</p>
        </div>
        <div style="display:flex;gap:.5rem;flex-shrink:0;">
          <button class="btn btn-secondary btn-sm btn-approve" data-id="${m.user_id}">${t('members.approve')}</button>
          <button class="btn btn-danger btn-sm btn-reject"     data-id="${m.user_id}">${t('members.reject')}</button>
        </div>
      </div>`).join('');

    el.querySelectorAll('.btn-approve').forEach(btn => btn.addEventListener('click', () => manageMember(btn.dataset.id, 'approved')));
    el.querySelectorAll('.btn-reject').forEach(btn  => btn.addEventListener('click', () => manageMember(btn.dataset.id, 'rejected')));
  } catch (_) {}
}

async function manageMember(userId, action) {
  try {
    await members.manage(userId, action);
    const msg = getLang() === 'en'
      ? (action === 'approved' ? 'Approved' : 'Rejected')
      : (action === 'approved' ? 'Одобрено' : 'Отклонено');
    toast(msg, 'ok');
    loadMembers();
  } catch (err) { toast(errorMessage(err), 'error'); }
}

q('#btn-invite')?.addEventListener('click', () => openModal('invite-modal'));

q('#btn-invite-confirm')?.addEventListener('click', async () => {
  const contact = q('#invite-contact')?.value.trim();
  const role    = q('#invite-role')?.value;

  q('#err-invite-contact')?.classList.remove('show');
  q('#err-invite-role')?.classList.remove('show');
  q('#err-invite')?.classList.add('hidden');

  let valid = true;
  if (!contact) { showFieldError('err-invite-contact', t('errors.required')); valid = false; }
  if (!role)    { showFieldError('err-invite-role',    t('errors.select_role')); valid = false; }
  if (!valid) return;

  const btn = q('#btn-invite-confirm');
  setLoading(btn, true);
  try {
    await members.invite(contact, role);
    closeModal('invite-modal');
    toast(getLang() === 'en' ? 'Invitation sent' : 'Приглашение отправлено', 'ok');
    if (q('#invite-contact')) q('#invite-contact').value = '';
    if (q('#invite-role'))    q('#invite-role').value    = '';
  } catch (err) {
    const errEl = q('#err-invite');
    if (errEl)  { errEl.classList.remove('hidden'); errEl.classList.add('show'); }
    const txt = q('#err-invite-text');
    if (txt)    txt.textContent = errorMessage(err);
  } finally { setLoading(btn, false); }
});

// ─────────────────────────────────────────────────────────────────
// SOCKET
// ─────────────────────────────────────────────────────────────────
function initSocketConn() {
  try {
    const socket = connectSocket();
    if (!socket) return;

    socketOn('user:notification', (data) => {
      const notif = { ...data, id: data.id || Date.now(), created_at: new Date().toISOString(), read_at: null };
      _notifications.unshift(notif);
      renderOverviewNotifs();
      if (currentTab === 'notifications') renderNotifications();
      updateNotifBadge(_notifications.filter(n => !n.read_at).length);
      toast(data.message_text || 'Новое уведомление', 'info');
    });

    socketOn('org:notification', (data) => {
      const notif = { ...data, id: data.id || Date.now(), created_at: new Date().toISOString(), read_at: null };
      _notifications.unshift(notif);
      renderOverviewNotifs();
      if (currentTab === 'notifications') renderNotifications();
      updateNotifBadge(_notifications.filter(n => !n.read_at).length);
    });
  } catch (_) {}
}

// ─────────────────────────────────────────────────────────────────
// LANGUAGE CHANGE
// ─────────────────────────────────────────────────────────────────
// On language switch, applyTranslations() handles every static [data-i18n]
// element, but a lot of profile/org content is built dynamically by JS
// (dates, sub-lines like "до N шт./заявку", role/status chips, sessions,
// etc.) — those don't carry a data-i18n by themselves. The cleanest way
// to keep everything in sync is to re-run the same render that initially
// populated the tabs. loadProfile() is idempotent and uses cached data
// at the network layer.
//
// Previously this callback also did `textContent = roleLabel(...)` on
// #info-role and #profile-role-badge — that destroyed the chip's icon +
// inner translatable <span>, leaving plain text behind. Removed.
onLangChange(() => {
  if (_userProfile) loadProfile().catch(() => {});
  // Sessions render their own labels ("session_current", date formats,
  // OS strings) inside loadSessions(); re-run it so the language switch
  // takes effect immediately on the open Profile tab.
  if (currentTab === 'profile') loadSessions().catch(() => {});
  if (_notifications.length) {
    renderNotifications();
    renderOverviewNotifs();
  }
});

// ─────────────────────────────────────────────────────────────────
// BOOT
// ─────────────────────────────────────────────────────────────────
loadProfile();
initSocketConn();

// ─────────────────────────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────────────────────────
function q(sel) { return document.querySelector(sel); }

function setLoading(btn, on) {
  if (!btn) return;
  btn.disabled = on;
  btn.classList.toggle('btn-loading', on);
}

function showFieldError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  const span = el.querySelector('span');
  if (span) span.textContent = msg;
  el.classList.add('show');
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatRelativeTime(isoStr) {
  if (!isoStr) return '';
  const diff  = Date.now() - new Date(isoStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  const lang  = getLang();
  if (mins < 1)   return lang === 'en' ? 'just now'     : 'только что';
  if (mins < 60)  return lang === 'en' ? `${mins}m ago`  : `${mins} мин. назад`;
  if (hours < 24) return lang === 'en' ? `${hours}h ago` : `${hours} ч. назад`;
  if (days < 7)   return lang === 'en' ? `${days}d ago`  : `${days} д. назад`;
  return new Date(isoStr).toLocaleDateString(lang === 'en' ? 'en-US' : 'ru-RU');
}
