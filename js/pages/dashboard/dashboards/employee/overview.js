/* ═══════════════════════════════════════════════════════════════
   Employee Overview — личные метрики + быстрый CTA на создание
   заявки и блок «Свободные заявки в пуле».
   ═══════════════════════════════════════════════════════════════ */

export function mountEmployeeOverview(_profile) {
  const slot = document.querySelector('#employee-overview-slot');
  if (!slot) return;

  slot.innerHTML = `
    <div class="stats-grid stats-grid--personal">
      <div class="stat-card stat-card--placeholder">
        <div class="stat-card-label">Мои в работе</div>
        <div class="stat-card-value">—</div>
        <div class="stat-card-hint">Скоро</div>
      </div>
      <div class="stat-card stat-card--placeholder">
        <div class="stat-card-label">Свободно в пуле</div>
        <div class="stat-card-value">—</div>
        <div class="stat-card-hint">Скоро</div>
      </div>
      <div class="stat-card stat-card--placeholder">
        <div class="stat-card-label">Закрыто за месяц</div>
        <div class="stat-card-value">—</div>
        <div class="stat-card-hint">Скоро</div>
      </div>
    </div>

    <div class="employee-cta" style="margin-top:1.5rem;">
      <button class="btn btn-primary btn-lg" disabled title="Скоро">
        <i class="ph ph-plus-circle"></i>
        <span>Создать заявку</span>
      </button>
    </div>

    <div class="card attention-card" style="margin-top:1.5rem;">
      <div class="card-header">
        <h2 class="card-title">Свободные заявки</h2>
      </div>
      <div class="attention-empty">
        <i class="ph-duotone ph-clipboard"></i>
        <p>Когда появятся открытые заявки в пуле организации или
           по контрактам, в которых вы участник, они будут здесь
           с кнопкой «Беру».</p>
      </div>
    </div>
  `;
}
