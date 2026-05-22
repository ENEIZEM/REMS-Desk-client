/* ═══════════════════════════════════════════════════════════════
   Change-PIN modal (#change-pin-modal) — three 6-digit groups.

   • Current PIN group is hidden when the user doesn't have a PIN
     yet (first-time set) — the form-guard treats a hidden group as
     "passed" so the save button can light up with just new+confirm.
   ═══════════════════════════════════════════════════════════════ */

import { auth, profile }          from '../../../api.js';
import { toast, errorMessage }    from '../../../auth.js';
import { t, getLang }             from '../../../i18n.js';
import { wireFormGuard }          from '../../../form-guard.js';
import {
  openModal, closeModal, setLoading,
  showAlertText, hideAlertById,
} from '../ui-helpers.js';

let _ctx = {
  getUserProfile:        () => null,
  getAvailableContacts:  () => [],
  refresh:               () => {},
};

let _guard = null;
let _guardStep1 = null;   // Guard для Next-кнопки шага 1 (proof).
let _curInputs = [];
let _newInputs = [];
let _cfmInputs = [];

// Helper: refresh обоих guard'ов (Next шага 1 + Save шага 2). Module-
// scope потому что setChpinStep тоже module-scope и должна вызывать.
function refreshBothGuards() {
  _guard?.refresh?.();
  _guardStep1?.refresh?.();
}

// State для step-up flow («забыли PIN»).
let _stepUp = {
  active: false,        // true → доказательство кодом, false → текущим PIN
  type:   null,         // 'email' | 'phone'
  target: null,         // raw value контакта
  code:   '',           // 6 цифр
  resendTimer: null,
};
let _wizardStep = 1;    // 1 = proof (current PIN или stepup), 2 = new PIN + confirm

// Переключение visible шага и кнопок в footer.
function setChpinStep(n) {
  _wizardStep = n;
  const step1Group = document.querySelector('#chpin-current-group');
  const step1Stepup = document.querySelector('#chpin-stepup-group');
  const step2     = document.querySelector('#chpin-step-2');
  const nextBtn   = document.querySelector('#btn-chpin-next');
  const saveBtn   = document.querySelector('#btn-save-pin');
  const backBtn   = document.querySelector('#btn-chpin-back');
  const isStep1   = n === 1;
  // Step 1 контролируется forgot toggle: либо current-PIN, либо step-up.
  if (step1Group)  step1Group.style.display  = isStep1 && !_stepUp.active ? '' : 'none';
  if (step1Stepup) {
    if (isStep1 && _stepUp.active) {
      step1Stepup.classList.remove('hidden');
      step1Stepup.style.display = 'flex';
    } else {
      step1Stepup.classList.add('hidden');
      step1Stepup.style.display = 'none';
    }
  }
  if (step2) {
    if (n === 2) { step2.classList.remove('hidden'); step2.style.display = 'flex'; }
    else         { step2.classList.add('hidden');    step2.style.display = 'none'; }
  }
  if (nextBtn) nextBtn.style.display = isStep1 ? '' : 'none';
  if (saveBtn) saveBtn.style.display = isStep1 ? 'none' : '';
  if (backBtn) backBtn.style.display = isStep1 ? 'none' : '';
  // hint в alert
  document.querySelector('#err-chpin')?.classList.remove('show');
  refreshBothGuards();
}

function wirePinGroup(rootSel) {
  const inputs = [...document.querySelectorAll(`${rootSel} .pin-input`)];
  inputs.forEach((input, idx) => {
    input.addEventListener('input', () => {
      input.value = input.value.replace(/\D/, '').slice(0, 1);
      input.classList.toggle('filled', !!input.value);
      if (input.value && idx < inputs.length - 1) inputs[idx + 1].focus();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !input.value && idx > 0) {
        inputs[idx - 1].focus();
        inputs[idx - 1].value = '';
        inputs[idx - 1].classList.remove('filled');
      }
    });
    input.addEventListener('paste', (e) => {
      const raw = (e.clipboardData || window.clipboardData)
        .getData('text').replace(/\D/g, '').slice(0, inputs.length);
      if (!raw) return;
      e.preventDefault();
      [...raw].forEach((ch, i) => { if (inputs[i]) { inputs[i].value = ch; inputs[i].classList.add('filled'); } });
      inputs[Math.min(raw.length, inputs.length) - 1]?.focus();
    });
  });
  return inputs;
}

function readDigits(inputs)  { return inputs.map(i => i.value).join(''); }
function clearDigits(inputs) { inputs.forEach(i => { i.value = ''; i.classList.remove('filled'); }); }

export function wireChangePin(ctx) {
  Object.assign(_ctx, ctx);

  _curInputs = wirePinGroup('#chpin-current');
  _newInputs = wirePinGroup('#chpin-new');
  _cfmInputs = wirePinGroup('#chpin-confirm');

  _guard = wireFormGuard({
    button:   '#btn-save-pin',
    required: [{
      kind:  'fn',
      watch: ['#chpin-current .pin-input', '#chpin-new .pin-input', '#chpin-confirm .pin-input', '.chpin-code-input'],
      fn: () => {
        const join = (sel) =>
          [...document.querySelectorAll(`${sel} .pin-input`)].map(i => i.value).join('');
        const newOk     = join('#chpin-new')     .length === 6;
        const confirmOk = join('#chpin-confirm') .length === 6;
        // Proof: либо текущий PIN, либо verification код, либо ничего
        // (если у юзера ещё нет PIN — первичная установка).
        const currentGroup = document.getElementById('chpin-current-group');
        const currentHidden = !currentGroup || currentGroup.offsetParent === null;
        let proofOk;
        if (_stepUp.active) {
          const code = [...document.querySelectorAll('.chpin-code-input')].map(i => i.value).join('');
          proofOk = !!_stepUp.target && code.length === 6;
        } else if (currentHidden) {
          proofOk = true;   // первая установка
        } else {
          proofOk = join('#chpin-current').length === 6;
        }
        return newOk && confirmOk && proofOk;
      },
    }],
  });

  // Form-guard для Next-кнопки шага 1: серая пока proof не введён
  // (current PIN заполнен ИЛИ выбран контакт + введён 6-значный код).
  _guardStep1 = wireFormGuard({
    button:   '#btn-chpin-next',
    required: [{
      kind:  'fn',
      watch: ['#chpin-current .pin-input', '.chpin-code-input'],
      fn: () => {
        if (_stepUp.active) {
          const code = [...document.querySelectorAll('.chpin-code-input')].map(i => i.value).join('');
          return !!_stepUp.target && code.length === 6;
        }
        const cur = [...document.querySelectorAll('#chpin-current .pin-input')].map(i => i.value).join('');
        return cur.length === 6;
      },
    }],
  });

  // Wire code-инпуты step-up (auto-advance / backspace / paste).
  const codeInputs = [...document.querySelectorAll('.chpin-code-input')];
  codeInputs.forEach((input, idx) => {
    input.addEventListener('input', () => {
      input.value = input.value.replace(/\D/, '').slice(0, 1);
      input.classList.toggle('filled', !!input.value);
      if (input.value && idx < codeInputs.length - 1) codeInputs[idx + 1].focus();
      refreshBothGuards();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !input.value && idx > 0) {
        codeInputs[idx - 1].focus();
        codeInputs[idx - 1].value = '';
        codeInputs[idx - 1].classList.remove('filled');
        refreshBothGuards();
      }
    });
    input.addEventListener('paste', (e) => {
      const raw = (e.clipboardData || window.clipboardData)
        .getData('text').replace(/\D/g, '').slice(0, codeInputs.length);
      if (!raw) return;
      e.preventDefault();
      [...raw].forEach((ch, i) => { if (codeInputs[i]) { codeInputs[i].value = ch; codeInputs[i].classList.add('filled'); } });
      codeInputs[Math.min(raw.length, codeInputs.length) - 1]?.focus();
      refreshBothGuards();
    });
  });

  // ─── Step-up toggle (forgot PIN) ──────────────────────────────────
  function selectStepUpContact(typeOrEntry) {
    const entry = typeof typeOrEntry === 'object'
      ? typeOrEntry
      : _ctx.getAvailableContacts().find(c => c.type === typeOrEntry);
    if (!entry) return;
    _stepUp.type   = entry.type;
    _stepUp.target = entry.value;
    document.querySelectorAll('#chpin-contact-choice .role-card').forEach(card => {
      const r = card.querySelector('input[name="chpin-contact"]');
      card.classList.toggle('selected', !!r?.checked);
    });
    refreshBothGuards();
  }

  function enterStepUp() {
    _stepUp.active = true;
    _stepUp.code   = '';
    document.querySelector('#chpin-current-group')?.style.setProperty('display', 'none');
    const su = document.querySelector('#chpin-stepup-group');
    if (su) { su.classList.remove('hidden'); su.style.display = 'flex'; }
    // 2 контакта → role-grid. 1 контакт → compact text вместо карточки.
    const available = _ctx.getAvailableContacts();
    const emailC    = available.find(c => c.type === 'email');
    const phoneC    = available.find(c => c.type === 'phone');
    const both      = !!emailC && !!phoneC;
    const choice    = document.querySelector('#chpin-contact-choice');
    const single    = document.querySelector('#chpin-contact-single');

    if (both) {
      if (single) single.style.display = 'none';
      if (choice) {
        choice.style.display = 'grid';
        choice.classList.remove('contact-picker--single');
      }
      document.querySelector('#chpin-contact-email-label').textContent = emailC.masked;
      document.querySelector('#chpin-contact-phone-label').textContent = phoneC.masked;
      document.querySelectorAll('#chpin-contact-choice input[name="chpin-contact"]').forEach(r => { r.checked = false; });
      document.querySelectorAll('#chpin-contact-choice .role-card').forEach(c => c.classList.remove('selected'));
      _stepUp.target = null;
      _stepUp.type   = null;
    } else if (emailC || phoneC) {
      if (choice) choice.style.display = 'none';
      if (single) single.style.display = 'flex';
      const entry     = emailC || phoneC;
      const typeLabel = entry.type === 'email' ? t('profile.email') : t('profile.phone');
      document.querySelector('#chpin-contact-single-type').textContent   = typeLabel;
      document.querySelector('#chpin-contact-single-target').textContent = entry.masked;
      selectStepUpContact(entry);
    } else {
      if (choice) choice.style.display = 'none';
      if (single) single.style.display = 'none';
    }
    document.querySelector('#chpin-code-block')?.classList.add('hidden');
    codeInputs.forEach(i => { i.value = ''; i.classList.remove('filled', 'error'); });
    // На step-up flow «code block» автоматически открывается после
    // отправки кода — но для шага 1 wizard'а хотим показать сразу.
    document.querySelector('#chpin-code-block')?.classList.remove('hidden');
    // Refresh wizard step (на случай если зовут из другого места).
    setChpinStep(1);
    refreshBothGuards();
  }

  function exitStepUp() {
    _stepUp.active = false;
    _stepUp.target = null;
    _stepUp.type   = null;
    _stepUp.code   = '';
    if (_stepUp.resendTimer) { clearInterval(_stepUp.resendTimer); _stepUp.resendTimer = null; }
    codeInputs.forEach(i => { i.value = ''; i.classList.remove('filled', 'error'); });
    // setChpinStep сама расставит display между current-PIN/stepup группами.
    setChpinStep(1);
    setTimeout(() => _curInputs[0]?.focus(), 50);
  }

  document.querySelector('#chpin-forgot-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    enterStepUp();
  });
  document.querySelector('#chpin-use-pin-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    exitStepUp();
  });

  // Радио-карточки контакта.
  document.querySelectorAll('#chpin-contact-choice input[name="chpin-contact"]').forEach(r => {
    r.addEventListener('change', () => {
      if (r.checked) selectStepUpContact(r.value);
    });
  });

  function setResendCountdown(seconds) {
    const btnRes = document.querySelector('#btn-chpin-resend');
    const waitEl = document.querySelector('#chpin-resend-wait');
    const cntEl  = document.querySelector('#chpin-resend-countdown');
    if (_stepUp.resendTimer) { clearInterval(_stepUp.resendTimer); _stepUp.resendTimer = null; }
    if (seconds <= 0) {
      if (waitEl) waitEl.classList.add('hidden');
      if (btnRes) btnRes.style.display = '';
      return;
    }
    if (waitEl) waitEl.classList.remove('hidden');
    if (btnRes) btnRes.style.display = 'none';
    if (cntEl)  cntEl.textContent = String(seconds);
    _stepUp.resendTimer = setInterval(() => {
      seconds -= 1;
      if (cntEl) cntEl.textContent = String(seconds);
      if (seconds <= 0) {
        clearInterval(_stepUp.resendTimer);
        _stepUp.resendTimer = null;
        if (waitEl) waitEl.classList.add('hidden');
        if (btnRes) btnRes.style.display = '';
      }
    }, 1000);
  }

  async function sendStepUpCode() {
    if (!_stepUp.target || !_stepUp.type) {
      return showAlertText('err-chpin', 'err-chpin-text', t('errors.required'));
    }
    hideAlertById('err-chpin');
    const btn = document.querySelector('#btn-chpin-send-code');
    setLoading(btn, true);
    try {
      // purpose='change_password' уже разрешён в верификации в схеме —
      // re-используем его как identity-proof для смены PIN внутри dashboard'а.
      const resp = await profile.sendCode({
        target:  _stepUp.target,
        type:    _stepUp.type,
        purpose: 'change_password',
      });
      const block = document.querySelector('#chpin-code-block');
      if (block) block.classList.remove('hidden');
      codeInputs.forEach(i => { i.value = ''; i.classList.remove('filled', 'error'); });
      codeInputs[0]?.focus();
      setResendCountdown(Number(resp?.data?.cooldown) || 60);
    } catch (err) {
      showAlertText('err-chpin', 'err-chpin-text', errorMessage(err));
    } finally {
      setLoading(btn, false);
    }
  }
  document.querySelector('#btn-chpin-send-code')?.addEventListener('click', sendStepUpCode);
  document.querySelector('#btn-chpin-resend')?.addEventListener('click', sendStepUpCode);

  document.querySelector('#btn-open-change-pin')?.addEventListener('click', () => {
    const hasPin = !!_ctx.getUserProfile()?.has_pin;
    // Step-up в reset state.
    exitStepUp();
    // Скрываем «Не помню PIN» link, если PIN ещё не задан (первая установка).
    document.querySelector('#chpin-forgot-link')?.style.setProperty('display', hasPin ? '' : 'none');
    [_curInputs, _newInputs, _cfmInputs].forEach(clearDigits);
    codeInputs.forEach(i => { i.value = ''; i.classList.remove('filled', 'error'); });
    hideAlertById('err-chpin');
    // Без PIN'а у юзера — первичная установка, доказательство не нужно,
    // прыгаем сразу на шаг 2 (новый PIN).
    if (!hasPin) {
      document.querySelector('#chpin-current-group')?.style.setProperty('display', 'none');
      setChpinStep(2);
      openModal('change-pin-modal');
      setTimeout(() => _newInputs[0]?.focus(), 80);
      return;
    }
    // Иначе нормальный 2-step flow.
    setChpinStep(1);
    openModal('change-pin-modal');
    setTimeout(() => _curInputs[0]?.focus(), 80);
  });

  // ── Next-button (step 1 → step 2) ─────────────────────────────
  document.querySelector('#btn-chpin-next')?.addEventListener('click', async () => {
    hideAlertById('err-chpin');
    const hasPin = !!_ctx.getUserProfile()?.has_pin;
    // Без PIN'а проверять нечего — этот путь не должен попадать на step 1 вообще.
    if (!hasPin) { setChpinStep(2); return; }

    if (_stepUp.active) {
      // Step-up flow: validation на бэке через reset-verify-code.
      if (!_stepUp.target) {
        return showAlertText('err-chpin', 'err-chpin-text', t('errors.required'));
      }
      const code = [...document.querySelectorAll('.chpin-code-input')].map(i => i.value).join('');
      if (code.length !== 6) {
        return showAlertText('err-chpin', 'err-chpin-text', t('errors.required'));
      }
      const btn = document.querySelector('#btn-chpin-next');
      setLoading(btn, true);
      try {
        const { auth } = await import('../../../api.js');
        await auth.resetVerifyCode(_stepUp.target, code);
        _stepUp.code = code;
        setChpinStep(2);
        setTimeout(() => _newInputs[0]?.focus(), 80);
      } catch (err) {
        showAlertText('err-chpin', 'err-chpin-text', errorMessage(err));
      } finally {
        setLoading(btn, false);
      }
      return;
    }

    // Normal flow: current PIN.
    const current = _curInputs.map(i => i.value).join('');
    if (current.length !== 6) {
      return showAlertText('err-chpin', 'err-chpin-text', t('errors.required'));
    }
    setChpinStep(2);
    setTimeout(() => _newInputs[0]?.focus(), 80);
  });

  document.querySelector('#btn-chpin-back')?.addEventListener('click', () => {
    setChpinStep(1);
  });

  document.querySelector('#btn-save-pin')?.addEventListener('click', async () => {
    hideAlertById('err-chpin');
    const hasPin = !!_ctx.getUserProfile()?.has_pin;
    const fresh   = readDigits(_newInputs);
    const confirm = readDigits(_cfmInputs);

    if (fresh.length !== 6) {
      return showAlertText('err-chpin', 'err-chpin-text', t('errors.pin_length'));
    }
    if (fresh !== confirm) {
      return showAlertText('err-chpin', 'err-chpin-text', t('errors.validation.pin_mismatch') || 'PIN codes do not match');
    }

    // Собираем proof: step-up (код), current_pin, или ничего (первичная установка).
    const payload = { pin: fresh, pin_confirm: confirm };
    if (hasPin) {
      if (_stepUp.active) {
        const code = readDigits([...document.querySelectorAll('.chpin-code-input')]);
        if (code.length !== 6 || !_stepUp.target) {
          return showAlertText('err-chpin', 'err-chpin-text', t('errors.required'));
        }
        payload.verification_code   = code;
        payload.verification_target = _stepUp.target;
      } else {
        const current = readDigits(_curInputs);
        if (current.length !== 6) {
          return showAlertText('err-chpin', 'err-chpin-text', t('errors.required'));
        }
        payload.current_pin = current;
      }
    }

    const btn = document.querySelector('#btn-save-pin');
    setLoading(btn, true);
    try {
      await auth.setPin(payload);
      toast(t('toasts.pin_updated'), 'ok');
      closeModal('change-pin-modal');
      exitStepUp();
      _ctx.refresh();
    } catch (err) {
      showAlertText('err-chpin', 'err-chpin-text', errorMessage(err));
    } finally {
      setLoading(btn, false);
    }
  });
}
