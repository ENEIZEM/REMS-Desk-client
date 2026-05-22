/* ═══════════════════════════════════════════════════════════════
   Owner Requests — placeholder. Реальный CRUD заявок будет
   реализован отдельной фазой (см. архитектурный план в чате).
   Сейчас рисуем макет того, как будет выглядеть.
   ═══════════════════════════════════════════════════════════════ */

export function mountOwnerRequests() {
  const slot = document.querySelector('#owner-requests-slot');
  if (!slot) return;

  slot.innerHTML = `
    <div class="placeholder-panel">
      <div class="placeholder-panel-icon">
        <i class="ph-duotone ph-clipboard-text"></i>
      </div>
      <h2 class="placeholder-panel-title">Заявки</h2>
      <p class="placeholder-panel-desc">
        Здесь будут все заявки в вашей организации: открытый пул,
        в работе, готовые к закрытию, просроченные. С фильтрами по
        приоритету, исполнителю, оборудованию и источнику
        (внутренние / по контрактам).
      </p>
      <div class="placeholder-mock">
        <div class="placeholder-chip placeholder-chip--active">Все</div>
        <div class="placeholder-chip">В пуле</div>
        <div class="placeholder-chip">В работе</div>
        <div class="placeholder-chip">Готовы</div>
        <div class="placeholder-chip">Закрыты</div>
        <div class="placeholder-chip">Просрочены</div>
      </div>
      <div class="placeholder-cards">
        <div class="placeholder-card placeholder-card--row"></div>
        <div class="placeholder-card placeholder-card--row"></div>
        <div class="placeholder-card placeholder-card--row"></div>
      </div>
    </div>
  `;
}
