/* ═══════════════════════════════════════════════════════════════
   OWNER dashboard orchestrator.
   Запускается role-router'ом после загрузки профиля если
   profile.user.org_role === 'owner'.

   Что делает:
     • Снимает hidden со всех owner-only элементов sidebar
     • Скрывает employee-only элементы (если такие есть)
     • Включает placeholder вкладки «Каталог» и «Партнёры»
     • Делегирует данные-логику в shared модули (members.js,
       organization.js, profile.js — те что уже существуют)

   НЕ дублирует boot, auth, socket — это всё уже сделано
   главным index.js. Этот файл — только UI-скоп для роли.
   ═══════════════════════════════════════════════════════════════ */

import { hide, show } from '../_shared/role-helpers.js';
import { mountOwnerOverview }  from './overview.js';
import { mountOwnerRequests }  from './requests.js';
import { mountOwnerCatalog }   from './catalog.js';
import { mountOwnerPartners }  from './partners.js';
import { setNotificationsTarget } from '../../notifications.js';

export function bootOwnerDashboard(profile) {
  // Notifications-фид всегда в #overview-notifs для owner/employee.
  // (Solo переопределяет на свой slot — при re-route назад вернёмся
  // к дефолту.)
  setNotificationsTarget('#overview-notifs');
  // ── Skoping видимости sidebar и tabs ──────────────────────────
  // role-attribute на body уже стоит, поэтому CSS-гейты сработают.
  // Дополнительно показываем owner-specific блоки которые могли
  // быть скрыты по умолчанию (например org-nav-section).
  show('#org-nav-section', 'block');
  show('#nav-item-org');
  hide('[data-role-only="employee"]');
  hide('[data-role-only="solo"]');

  // ── Mount tab-content модулей ────────────────────────────────
  mountOwnerOverview(profile);
  mountOwnerRequests();
  mountOwnerCatalog();
  mountOwnerPartners();
  // Team (Members), Organization, Profile вкладки уже инициализированы
  // существующим index.js — здесь повторно ничего не делаем.
}
