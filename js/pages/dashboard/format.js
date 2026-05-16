/* ═══════════════════════════════════════════════════════════════
   Formatting + avatar helpers shared by the profile and
   organization tabs and the navbar dropdown identity block.
   ═══════════════════════════════════════════════════════════════ */

import { t, getLang } from '../../i18n.js';

export function roleLabel(role) {
  return t(`roles.${role}`) || role || '—';
}

export function fmtDate(value) {
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

export function fmtBytes(n) {
  if (!n) return '—';
  const mb = n / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(n / 1024).toFixed(0)} KB`;
}

export function initials(name) {
  return String(name).split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('') || '?';
}

// Render a user/org avatar into (initialsEl, imgEl). Backend shape is
// {avatar:{id,url}} | null; we also accept the legacy flat avatar_url
// field for older payloads. A cache-buster derived from the media id
// (or updated_at) is appended so the <img> reloads when a new file
// replaces an existing URL.
//
// Also updates the hover-overlay icon on the wrapping .avatar-upload
// (if any) — `ph-camera-rotate` when a photo is attached, plain
// `ph-camera` when it's still initials. Lets the user understand the
// click action without first opening the modal.
export function setAvatar(initialsEl, imgEl, user) {
  if (!initialsEl) return;
  const baseUrl = user?.avatar?.url || user?.avatar_url || '';
  const hasPhoto = !!baseUrl;
  if (hasPhoto) {
    const v   = user?.avatar?.id ?? user?.updated_at ?? Date.now();
    const sep = baseUrl.includes('?') ? '&' : '?';
    initialsEl.style.display = 'none';
    if (imgEl) { imgEl.src = `${baseUrl}${sep}v=${encodeURIComponent(v)}`; imgEl.style.display = ''; }
  } else {
    initialsEl.style.display = '';
    initialsEl.textContent = initials(user?.full_name || user?.email_masked || user?.email || '?');
    if (imgEl) { imgEl.style.display = 'none'; imgEl.src = ''; }
  }
  // Toggle hover-icon between "add" (camera) and "replace" (camera-rotate).
  const wrap = initialsEl.closest('.avatar-upload, .profile-org-logo');
  const overlayIcon = wrap?.querySelector('.avatar-upload-overlay i');
  if (overlayIcon) {
    overlayIcon.className = hasPhoto ? 'ph ph-camera-rotate' : 'ph ph-camera';
  }
}
