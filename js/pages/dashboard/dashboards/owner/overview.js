/* ═══════════════════════════════════════════════════════════════
   Owner Overview — admin-метрики + блок «Требует внимания».
   Сейчас только базовые stat-cards + лента уведомлений (уже
   рендерится в общей overview-панели). Остальные блоки — заглушки.
   ═══════════════════════════════════════════════════════════════ */

export function mountOwnerOverview(profile) {
  const slot = document.querySelector('#owner-overview-slot');
  if (!slot) return;

  const empCount = profile?.organization?.current_employee_count ?? 0;
  const empMax   = profile?.organization?.limits?.max_employees ?? '—';

  slot.innerHTML = `
    <div class="stats-grid stats-grid--admin">
      <div class="stat-card">
        <div class="stat-card-label">Сотрудников</div>
        <div class="stat-card-value">${empCount}<span class="stat-card-sub">/${empMax}</span></div>
      </div>
      <div class="stat-card stat-card--placeholder">
        <div class="stat-card-label">Открытых заявок</div>
        <div class="stat-card-value">—</div>
        <div class="stat-card-hint">Скоро</div>
      </div>
      <div class="stat-card stat-card--placeholder">
        <div class="stat-card-label">В работе</div>
        <div class="stat-card-value">—</div>
        <div class="stat-card-hint">Скоро</div>
      </div>
      <div class="stat-card stat-card--placeholder">
        <div class="stat-card-label">Просрочено</div>
        <div class="stat-card-value">—</div>
        <div class="stat-card-hint">Скоро</div>
      </div>
    </div>

    <div class="card attention-card" style="margin-top:1.5rem;">
      <div class="card-header">
        <h2 class="card-title">Требует внимания</h2>
      </div>
      <div class="attention-empty">
        <i class="ph-duotone ph-check-circle"></i>
        <p>Всё под контролем. Когда появятся pending-сотрудники или
           зависшие заявки, они появятся здесь.</p>
      </div>
    </div>
  `;
}
