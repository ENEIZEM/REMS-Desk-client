/* ═══════════════════════════════════════════════════════════════
   Owner Partners — контракты (placeholder). Real CRUD позже.
   ═══════════════════════════════════════════════════════════════ */

export function mountOwnerPartners() {
  const slot = document.querySelector('#owner-partners-slot');
  if (!slot) return;

  slot.innerHTML = `
    <div class="placeholder-panel">
      <div class="placeholder-panel-icon">
        <i class="ph-duotone ph-handshake"></i>
      </div>
      <h2 class="placeholder-panel-title">Партнёры</h2>
      <p class="placeholder-panel-desc">
        Договоры с другими организациями. Когда мы — заказчик,
        видим список наших подрядчиков и можем создавать им заявки.
        Когда мы — подрядчик, видим клиентов и назначаем кого из
        наших сотрудников допустить к работе по контракту.
      </p>
      <div class="placeholder-mock">
        <div class="placeholder-chip placeholder-chip--active">К подрядчикам</div>
        <div class="placeholder-chip">Мы — подрядчик</div>
        <div class="placeholder-chip">Предложения</div>
      </div>
      <div class="placeholder-cards">
        <div class="placeholder-card placeholder-card--row"></div>
        <div class="placeholder-card placeholder-card--row"></div>
      </div>
    </div>
  `;
}
