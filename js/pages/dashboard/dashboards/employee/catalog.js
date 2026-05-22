/* ═══════════════════════════════════════════════════════════════
   Employee Catalog — read-only оборудование (placeholder).
   ═══════════════════════════════════════════════════════════════ */

export function mountEmployeeCatalog() {
  const slot = document.querySelector('#employee-catalog-slot');
  if (!slot) return;

  slot.innerHTML = `
    <div class="placeholder-panel">
      <div class="placeholder-panel-icon">
        <i class="ph-duotone ph-desktop-tower"></i>
      </div>
      <h2 class="placeholder-panel-title">Каталог оборудования</h2>
      <p class="placeholder-panel-desc">
        Реестр оборудования организации. Read-only — добавляет/
        редактирует только руководитель. У каждой единицы — кнопка
        «Создать заявку по этому оборудованию».
      </p>
      <div class="placeholder-cards placeholder-cards--grid">
        <div class="placeholder-card placeholder-card--tile"></div>
        <div class="placeholder-card placeholder-card--tile"></div>
        <div class="placeholder-card placeholder-card--tile"></div>
      </div>
    </div>
  `;
}
