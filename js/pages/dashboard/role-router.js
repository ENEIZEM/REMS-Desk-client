/* ═══════════════════════════════════════════════════════════════
   REMS — Role Router
   Определяет какой из трёх дашбордов показать пользователю:
     • solo      — нет организации (organization == null)
     • employee  — состоит в орге как обычный сотрудник
     • owner     — состоит в орге как руководитель

   Pending / rejected / suspended мемберы возвращают «virtual»
   solo-режим (как будто без орги — потому что доступ к данным
   орги у них закрыт RLS), но с соответствующей подсказкой.

   Используется в boot после загрузки профиля.
   ═══════════════════════════════════════════════════════════════ */

/** Возвращает 'owner' | 'employee' | 'solo' на основе профиля. */
export function detectRole(profile) {
  if (!profile?.organization) return 'solo';
  const status = profile?.membership?.status ?? profile?.user?.membership_status;
  // Любой нестандартный статус — solo-экран с дополнительной подсказкой.
  if (status && status !== 'approved') return 'solo';
  if (profile?.user?.org_role === 'owner') return 'owner';
  return 'employee';
}

/** Расставляет body.dataset.role + body.dataset.membership для CSS-гейтов. */
export function applyRoleAttributes(role, membershipStatus) {
  document.body.dataset.role = role;
  if (membershipStatus) document.body.dataset.membership = membershipStatus;
  else                  delete document.body.dataset.membership;
}

/** Lazy-импорт нужного оркестратора для роли. */
export async function loadDashboardForRole(role) {
  switch (role) {
    case 'owner':
      return (await import('./dashboards/owner/index.js')).bootOwnerDashboard;
    case 'employee':
      return (await import('./dashboards/employee/index.js')).bootEmployeeDashboard;
    case 'solo':
    default:
      return (await import('./dashboards/solo/index.js')).bootSoloDashboard;
  }
}
