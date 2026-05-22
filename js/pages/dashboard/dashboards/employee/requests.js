/* ═══════════════════════════════════════════════════════════════
   Employee Requests placeholder.
   Будет три под-вкладки: Свободные / Мои в работе / Созданные мной.
   ═══════════════════════════════════════════════════════════════ */

export function mountEmployeeRequests() {
  const slot = document.querySelector('#employee-requests-slot');
  if (!slot) return;

  slot.innerHTML = `
    <div class="placeholder-panel">
      <div class="placeholder-panel-icon">
        <i class="ph-duotone ph-clipboard-text"></i>
      </div>
      <h2 class="placeholder-panel-title">Заявки</h2>
      <p class="placeholder-panel-desc">
        Три внутренних раздела:
        <strong>Свободные</strong> (открытый пул, можно «Беру»),
        <strong>Мои в работе</strong> (взятые мной + назначенные),
        <strong>Созданные мной</strong> (мои заявки и их статус).
      </p>
      <div class="placeholder-mock">
        <div class="placeholder-chip placeholder-chip--active">Свободные</div>
        <div class="placeholder-chip">Мои в работе</div>
        <div class="placeholder-chip">Созданные мной</div>
      </div>
      <div class="placeholder-cards">
        <div class="placeholder-card placeholder-card--row"></div>
        <div class="placeholder-card placeholder-card--row"></div>
      </div>
    </div>
  `;
}
