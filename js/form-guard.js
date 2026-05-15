/* ═══════════════════════════════════════════════════════════════
   REMS — Form Guard (purely visual)
   ───────────────────────────────────────────────────────────────
   Adds a gray "pending" look to a submit button while a list of
   required fields/groups is empty. Click is NOT intercepted — the
   existing submit handler keeps doing its own validation (paint
   field errors, focus first empty, etc.).

   Usage:
       import { wireFormGuard } from '../form-guard.js';
       const guard = wireFormGuard({
         button:   '#btn-step1',
         required: [
           { sel: '#reg-contact', kind: 'text' },
           { sel: 'input[name="role"]', kind: 'radio-group' },
           { sel: '.pin-input',  kind: 'digit-group', total: 6 },
         ],
       });
       // Later, after programmatic mutations:
       guard.refresh();
   ═══════════════════════════════════════════════════════════════ */

function valueOf(node, kind, opts = {}) {
  switch (kind) {
    case 'text':
    case 'number':
      return String(node.value || '').trim();
    case 'select':
      return String(node.value || '').trim();
    case 'radio-group': {
      // sel returned a NodeList — at least one must be checked
      return [...node].some(r => r.checked) ? '1' : '';
    }
    case 'digit-group': {
      const total = opts.total ?? node.length;
      const joined = [...node].map(i => i.value).join('');
      return joined.length === total ? joined : '';
    }
    default:
      return String(node.value || '').trim();
  }
}

function resolve(spec) {
  if (spec.kind === 'fn') return null;       // function-based specs query themselves
  const found = spec.kind === 'radio-group' || spec.kind === 'digit-group'
    ? document.querySelectorAll(spec.sel)
    : document.querySelector(spec.sel);
  return found;
}

export function wireFormGuard({ button, required }) {
  const btn = typeof button === 'string' ? document.querySelector(button) : button;
  if (!btn) return { refresh: () => {} };

  function isFilled(spec) {
    if (spec.kind === 'fn') {
      try { return !!spec.fn(); } catch { return false; }
    }
    const node = resolve(spec);
    if (!node) return false;
    return !!valueOf(node, spec.kind, spec);
  }
  function refresh() {
    btn.classList.toggle('is-pending', !required.every(isFilled));
  }

  refresh();

  // Listen for changes on each required field. Re-queries the DOM each
  // call to handle dynamically-rendered fields (e.g. role cards that
  // appear after step transitions).
  for (const spec of required) {
    let nodes;
    if (spec.kind === 'fn') {
      // function-based specs may declare an optional watch selector list
      // (sel can be a single string or an array) for re-evaluation hooks.
      const sels = Array.isArray(spec.watch) ? spec.watch : (spec.watch ? [spec.watch] : []);
      nodes = sels.flatMap(s => [...document.querySelectorAll(s)]);
    } else {
      nodes = spec.kind === 'radio-group' || spec.kind === 'digit-group'
        ? [...document.querySelectorAll(spec.sel)]
        : [document.querySelector(spec.sel)].filter(Boolean);
    }
    nodes.forEach(n => {
      n.addEventListener('input',  refresh);
      n.addEventListener('change', refresh);
    });
  }

  return { refresh };
}
