/* ═══════════════════════════════════════════════════════════════
   Утилиты ролевого скрытия/показа. Используются всеми тремя
   дашбордами (owner / employee / solo) чтобы не дублировать
   querySelector + classList.toggle паттерны.

   Body атрибут data-role уже выставлен role-router'ом до boot'а
   конкретного дашборда. CSS-селекторы вида
       body[data-role="employee"] .owner-only { display: none }
   тоже работают, но JS-хелпер удобен для динамических кейсов
   (например, переключение видимости кнопки после загрузки профиля).
   ═══════════════════════════════════════════════════════════════ */

/** Скрыть все элементы с классом или атрибутом по селектору. */
export function hide(selector) {
  document.querySelectorAll(selector).forEach(el => {
    el.classList.add('hidden');
    el.style.display = 'none';
  });
}

/** Показать (display:''). */
export function show(selector, displayValue = '') {
  document.querySelectorAll(selector).forEach(el => {
    el.classList.remove('hidden');
    el.style.display = displayValue;
  });
}

/** Удалить элементы из DOM целиком (для blocks которые не нужны вообще). */
export function remove(selector) {
  document.querySelectorAll(selector).forEach(el => el.remove());
}
