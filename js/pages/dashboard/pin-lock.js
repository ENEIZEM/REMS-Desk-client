/* ═══════════════════════════════════════════════════════════════
   REMS — PIN-lock overlay
   Показывается на boot дашборда, если pin-gate не выдал one-shot pass.
   Блокирует UI до успешного /api/auth/verify-pin или logout'а.
   ═══════════════════════════════════════════════════════════════ */

import { auth }         from '../../api.js';
import { logout }       from '../../auth.js';
import { t }            from '../../i18n.js';
import { grantPinPass } from '../../lib/pin-gate.js';
import { createCodeInput } from '../../lib/code-input.js';

/**
 * Показать оверлей и ждать успешного PIN. Resolves когда юзер прошёл.
 * При нажатии «Выйти» вызывается logout() — функция в этом случае
 * не зарезолвится, так как страница уже редиректится.
 */
export function requirePinUnlock() {
  return new Promise((resolve) => {
    const overlay = document.getElementById('pin-lock-overlay');
    if (!overlay) {
      // На случай если по какой-то причине разметки нет — не блокируем дашборд.
      console.warn('[pin-lock] overlay not present in DOM, skipping');
      resolve();
      return;
    }

    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden', 'false');
    document.documentElement.style.overflow = 'hidden';

    const errBox  = overlay.querySelector('#pin-lock-error');
    const errText = overlay.querySelector('#pin-lock-error-text');

    // Активный countdown — секундный интервал, обновляющий текст с
    // оставшимся временем lockout'а. При достижении 0 авто-clearError.
    let lockTimer = null;
    let lockEndsAt = 0;

    function formatRemaining(sec) {
      const s = Math.max(0, Math.ceil(sec));
      if (s < 60) return `${s} сек`;
      const m = Math.floor(s / 60);
      const r = s % 60;
      return r > 0 ? `${m} мин ${r} сек` : `${m} мин`;
    }

    function showError(msg) {
      if (errBox && errText) {
        errText.textContent = msg;
        // .alert по дефолту display:none — нужен класс .show чтобы стать
        // display:flex. Класс .hidden — legacy маркер, безвреден.
        errBox.classList.add('show');
        errBox.classList.remove('hidden');
      }
      overlay.querySelectorAll('.pin-lock-input').forEach(i => i.classList.add('error'));
    }
    function clearError() {
      if (errBox) {
        errBox.classList.remove('show');
        errBox.classList.add('hidden');
      }
      overlay.querySelectorAll('.pin-lock-input').forEach(i => i.classList.remove('error'));
      if (lockTimer) { clearInterval(lockTimer); lockTimer = null; }
      lockEndsAt = 0;
      // Разблокируем инпуты после окончания таймера.
      overlay.querySelectorAll('.pin-lock-input').forEach(i => { i.disabled = false; });
    }

    function startLockCountdown(retryAfterSec) {
      if (lockTimer) clearInterval(lockTimer);
      lockEndsAt = Date.now() + Math.max(0, Number(retryAfterSec) || 0) * 1000;
      // Дисейблим инпуты — пока залочены, ввод бесполезен.
      overlay.querySelectorAll('.pin-lock-input').forEach(i => { i.disabled = true; });
      const tick = () => {
        const left = (lockEndsAt - Date.now()) / 1000;
        if (left <= 0) {
          clearError();
          return;
        }
        if (errText) {
          errText.textContent = t('errors.auth.pin_locked_with_timer', {
            time: formatRemaining(left),
          });
        }
      };
      tick();
      lockTimer = setInterval(tick, 1000);
    }

    const codeCtl = createCodeInput({
      inputs:   '#pin-lock-overlay .pin-lock-input',
      onChange: clearError,
    });

    let busy = false;
    async function attempt() {
      if (busy) return;
      const pin = codeCtl.read();
      if (!/^\d{6}$/.test(pin)) return;
      busy = true;
      try {
        await auth.verifyPin(pin);
        // Помечаем удачную верификацию — последующая навигация в этой же
        // вкладке без reload'а не должна снова просить PIN. Сам флаг
        // потребляется при следующем boot'е dashboard.html.
        grantPinPass();
        overlay.classList.remove('show');
        overlay.setAttribute('aria-hidden', 'true');
        document.documentElement.style.overflow = '';
        resolve();
      } catch (err) {
        const key    = err?.error_key;
        const params = err?.data?.error_params || {};
        // Backend может вернуть retry_after на верхнем уровне err.data —
        // проверим оба места.
        const retryAfter = Number(params.retry_after ?? err?.data?.retry_after) || 0;
        if (key === 'errors.auth.pin_locked' || retryAfter > 0) {
          // Активируем countdown, который сам периодически обновит
          // текст «Повторите через X сек/мин» и снимет ошибку на 0.
          showError(t('errors.auth.pin_locked_with_timer', {
            time: formatRemaining(retryAfter),
          }));
          startLockCountdown(retryAfter);
        } else if (key === 'errors.auth.pin_invalid' && typeof params.attempts_remaining === 'number') {
          showError(t('errors.auth.pin_invalid_with_attempts', { n: params.attempts_remaining }));
        } else if (key) {
          const translated = t(key);
          showError(translated !== key ? translated : t('errors.auth.pin_invalid'));
        } else {
          showError(t('errors.auth.pin_invalid'));
        }
        codeCtl.clear();
        codeCtl.focus();
      } finally {
        busy = false;
      }
    }

    // Submit либо по Enter, либо автоматически когда заполнена 6-я цифра.
    const inputs = overlay.querySelectorAll('.pin-lock-input');
    inputs.forEach((inp, idx) => {
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); attempt(); }
      });
      if (idx === inputs.length - 1) {
        inp.addEventListener('input', () => {
          if (inp.value && codeCtl.read().length === 6) {
            // Маленькая задержка чтобы юзер успел увидеть последнюю цифру.
            setTimeout(attempt, 80);
          }
        });
      }
    });

    overlay.querySelector('#pin-lock-logout')?.addEventListener('click', () => {
      // logout() сам делает редирект; promise не зарезолвится.
      logout();
    });

    // Фокус на первом инпуте; небольшая задержка чтобы overlay успел
    // отрисоваться и transition не съел фокус.
    setTimeout(() => codeCtl.focus(), 50);
  });
}
