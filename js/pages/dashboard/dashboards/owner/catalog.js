/* ═══════════════════════════════════════════════════════════════
   Owner Catalog — оборудование + категории (placeholder).
   Реальный CRUD оборудования — следующая фаза.
   ═══════════════════════════════════════════════════════════════ */

export function mountOwnerCatalog() {
  const slot = document.querySelector('#owner-catalog-slot');
  if (!slot) return;

  slot.innerHTML = `
    <div class="placeholder-panel">
      <div class="placeholder-panel-icon">
        <i class="ph-duotone ph-desktop-tower"></i>
      </div>
      <h2 class="placeholder-panel-title">Каталог</h2>
      <p class="placeholder-panel-desc">
        Реестр оборудования организации с категориями. Каждая
        единица: фото, серийный номер, расположение, статус, история
        заявок. Сотрудники будут выбирать оборудование из этого
        реестра при создании заявки.
      </p>
      <div class="placeholder-mock">
        <div class="placeholder-chip placeholder-chip--active">Оборудование</div>
        <div class="placeholder-chip">Категории</div>
      </div>
      <div class="placeholder-cards placeholder-cards--grid">
        <div class="placeholder-card placeholder-card--tile"></div>
        <div class="placeholder-card placeholder-card--tile"></div>
        <div class="placeholder-card placeholder-card--tile"></div>
        <div class="placeholder-card placeholder-card--tile"></div>
      </div>
    </div>
  `;
}
