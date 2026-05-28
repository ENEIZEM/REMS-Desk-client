/* ═══════════════════════════════════════════════════════════════
   Owner Contracts — identical to employee/contracts.js (placeholder).
   В будущем здесь будет CRUD контрактов (создать / приостановить /
   завершить); сейчас просто список с empty-state.
   ═══════════════════════════════════════════════════════════════ */

import { mountEmployeeContracts } from '../employee/contracts.js';

export function mountOwnerContracts(profile) {
  // Делегируем — UI identical. Когда добавим owner-only управление,
  // будем форкать здесь.
  mountEmployeeContracts(profile);
}
