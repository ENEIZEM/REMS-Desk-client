/* ═══════════════════════════════════════════════════════════════
   EMPLOYEE dashboard orchestrator.
   role-router вызывает после loadProfile для approved сотрудника.

   В сравнении с owner:
     • Скрывает «Команда» management actions (manage / remove)
     • Скрывает «Партнёры» вкладку — контракты ведёт руководитель
     • Скрывает invite-кнопку
     • Members rendered как «Коллеги» (read-only)
     • Organization рендерится в read-only режиме (edit-кнопки
       скрыты автоматически по permissions из /profile/me)
   ═══════════════════════════════════════════════════════════════ */

import { hide, show } from '../_shared/role-helpers.js';
import { mountEmployeeOverview }  from './overview.js';
import { mountEmployeeRequests }  from './requests.js';
import { mountEmployeeCatalog }   from './catalog.js';
import { setNotificationsTarget } from '../../notifications.js';

export function bootEmployeeDashboard(profile) {
  setNotificationsTarget('#overview-notifs');
  show('#org-nav-section', 'block');
  show('#nav-item-org');
  hide('[data-role-only="owner"]');
  hide('[data-role-only="solo"]');

  // Members tab переименовываем в «Коллеги» — done через i18n
  // (см. dashboard/index.js → tab title swap). Здесь только убираем
  // manage actions (per-row delete button, invite header button).
  hide('#btn-invite');
  hide('.members-row-delete');

  mountEmployeeOverview(profile);
  mountEmployeeRequests();
  mountEmployeeCatalog();
}
