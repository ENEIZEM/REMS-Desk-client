/* ═══════════════════════════════════════════════════════════════
   SOLO dashboard orchestrator.
   Юзер не в организации — у него только две вкладки: «Главная»
   (welcome + CTA на создание/вступление) и «Профиль».
   Прячем всю sidebar-секцию «Организация», все owner/employee
   контент-блоки. Включаем solo-tab-panel.
   ═══════════════════════════════════════════════════════════════ */

import { hide, show } from '../_shared/role-helpers.js';
import { mountSoloHome } from './home.js';

export function bootSoloDashboard(profile) {
  // Sidebar: оставляем только Главную + Профиль. Скрываем всё что
  // относится к работе внутри организации (Заявки, Каталог, Партнёры,
  // Команда, Организация).
  hide('#org-nav-section');
  hide('[data-role-only="owner"]');
  hide('[data-role-only="employee"]');
  hide('.nav-item[data-tab="requests"]');
  hide('.nav-item[data-tab="equipment"]');
  hide('.nav-item[data-tab="catalog"]');
  hide('.nav-item[data-tab="partners"]');

  // «Обзор» переименовываем в «Главная» — переключаем data-tab,
  // чтобы клик вёл на solo-tab-panel.
  const homeBtn = document.querySelector('.nav-item[data-tab="overview"]');
  if (homeBtn) {
    homeBtn.dataset.tab = 'solo-home';
    const span = homeBtn.querySelector('span');
    if (span) span.textContent = 'Главная';
  }

  // Скрываем все остальные tab-panel'ы — solo home единственный visible.
  hide('#tab-overview');
  hide('#tab-requests');
  hide('#tab-equipment');
  hide('#tab-catalog');
  hide('#tab-partners');
  hide('#tab-members');
  hide('#tab-org');

  show('#tab-solo-home');
  document.querySelector('#tab-solo-home')?.classList.add('active');

  mountSoloHome(profile);
}
