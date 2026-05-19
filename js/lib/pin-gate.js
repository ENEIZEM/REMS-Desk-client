/* ═══════════════════════════════════════════════════════════════
   REMS — PIN gate
   Решает один-единственный вопрос: нужно ли требовать PIN
   при текущем boot'е дашборда?

   Правило:
   PIN запрашивается ВСЕГДА, кроме случая «юзер только что прошёл
   аутентификацию» — т.е. предыдущая страница была /pages/login.html
   или /pages/register.html (там он уже ввёл PIN или сам его задал).

   Любые другие источники навигации (лендинг, прямой ввод URL, закладка,
   reload в самом дашборде, открытие новой вкладки) → PIN обязателен.

   Никакого session/localStorage флага нет — иначе он начинает протекать
   из неожиданных мест («поставили в одной вкладке — другая решила, что
   PIN уже прошли»). document.referrer заполняется браузером и для
   reload'а пуст, поэтому reload всегда → PIN.

   Внутридашбордные tab-переключения работают через location.hash и НЕ
   перезагружают страницу — этот модуль вообще не вызывается, PIN не
   спрашивается. Это покрывает пункт «PIN только по действиям юзера».
   ═══════════════════════════════════════════════════════════════ */

const ALLOWED_AUTH_PATHS = ['/pages/login.html', '/pages/register.html'];

/**
 * True если PIN можно НЕ спрашивать на этом boot'е дашборда.
 * Считаем «свежей аутентификацией» только переход с login.html/register.html
 * того же origin'а.
 */
export function pinUnlockGrantedByReferrer() {
  try {
    const ref = document.referrer;
    if (!ref) return false;
    const u = new URL(ref);
    if (u.origin !== location.origin) return false;
    return ALLOWED_AUTH_PATHS.includes(u.pathname);
  } catch {
    return false;
  }
}

// Совместимость со старым именем для уже подключенных мест.
// grantPinPass / clearPinPass теперь noop'ы — не используем localStorage
// флаг, потому что он живёт слишком долго.
export function grantPinPass()   { /* noop — управляется referrer-ом */ }
export function clearPinPass()   { /* noop */ }
export function consumePinPass() { return pinUnlockGrantedByReferrer(); }
