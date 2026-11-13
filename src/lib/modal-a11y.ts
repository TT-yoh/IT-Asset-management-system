/**
 * App-wide accessibility layer for modals and form fields.
 *
 * Modals in this app are rendered as full-screen overlays marked with
 * `data-modal-overlay`. Instead of re-implementing keyboard handling in each of
 * them, this module watches the DOM once and gives every overlay the same
 * behaviour:
 *
 *  - role="dialog" / aria-modal / aria-labelledby (first heading in the modal)
 *  - focus moves into the modal when it opens and returns to the element that
 *    opened it when it closes
 *  - Tab / Shift+Tab stay inside the topmost modal
 *  - Escape activates the modal's own close control, so each modal's existing
 *    cleanup logic runs. The close control is `[data-modal-close]`, else a
 *    button whose accessible label contains "close", else the first button
 *    showing only an X icon.
 *
 * It also links `<label>` elements to the form control that follows them when
 * the markup has no `htmlFor`, so screen readers announce field names and
 * clicking a label focuses its field.
 */

const OVERLAY_SELECTOR = '[data-modal-overlay]';
const CONTROL_SELECTOR = 'input:not([type="hidden"]), select, textarea';
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

let installed = false;
let idCounter = 0;
const openerByOverlay = new Map<HTMLElement, HTMLElement | null>();

const nextId = (prefix: string) => `${prefix}-${++idCounter}`;

function isVisible(el: HTMLElement): boolean {
  return el.getClientRects().length > 0;
}

function getTopOverlay(): HTMLElement | null {
  const overlays = document.querySelectorAll<HTMLElement>(OVERLAY_SELECTOR);
  return overlays.length ? overlays[overlays.length - 1]! : null;
}

function getFocusable(overlay: HTMLElement): HTMLElement[] {
  return Array.from<HTMLElement>(overlay.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isVisible);
}

function findCloseControl(overlay: HTMLElement): HTMLElement | null {
  const explicit = overlay.querySelector<HTMLElement>('[data-modal-close]');
  if (explicit) return explicit;

  const buttons = Array.from<HTMLButtonElement>(overlay.querySelectorAll<HTMLButtonElement>('button'));
  const labelled = buttons.find((btn) =>
    /\b(close|dismiss|cancel)\b/i.test(`${btn.getAttribute('aria-label') || ''} ${btn.title || ''}`)
  );
  if (labelled) return labelled;

  // Icon-only button showing the lucide "X" glyph.
  const iconClose = buttons.find(
    (btn) => !btn.textContent?.trim() && btn.querySelector('svg.lucide-x') !== null
  );
  if (iconClose) return iconClose;

  // A button whose whole text is a close glyph ("✕", "×") or the word Close / Cancel.
  const text = (btn: HTMLButtonElement) => (btn.textContent || '').trim();
  return (
    buttons.find((btn) => /^[✕✖×xX]$/.test(text(btn))) ||
    buttons.find((btn) => /^close$/i.test(text(btn))) ||
    buttons.find((btn) => /^cancel$/i.test(text(btn))) ||
    null
  );
}

function prepareOverlay(overlay: HTMLElement) {
  if (openerByOverlay.has(overlay)) return;
  const active = document.activeElement as HTMLElement | null;
  openerByOverlay.set(overlay, active && !overlay.contains(active) ? active : null);

  const hasOwnDialog =
    overlay.hasAttribute('role') || overlay.querySelector('[role="dialog"], [role="alertdialog"]') !== null;
  if (!hasOwnDialog) {
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    const heading = overlay.querySelector<HTMLElement>('h1, h2, h3, h4');
    if (heading) {
      if (!heading.id) heading.id = nextId('modal-title');
      overlay.setAttribute('aria-labelledby', heading.id);
    }
  }
  if (!overlay.hasAttribute('tabindex')) overlay.setAttribute('tabindex', '-1');

  // Label icon-only close buttons so they are announced as "Close".
  const close = findCloseControl(overlay);
  if (close && !close.getAttribute('aria-label') && !close.textContent?.trim()) {
    close.setAttribute('aria-label', 'Close');
  }

  if (overlay.contains(document.activeElement)) return;
  const target =
    overlay.querySelector<HTMLElement>('[data-autofocus]') ||
    Array.from<HTMLElement>(overlay.querySelectorAll<HTMLElement>(CONTROL_SELECTOR)).find(
      (el) => isVisible(el) && !(el as HTMLInputElement).disabled
    ) ||
    overlay;
  target.focus({ preventScroll: true });
}

function releaseClosedOverlays() {
  for (const [overlay, opener] of Array.from(openerByOverlay.entries())) {
    if (overlay.isConnected) continue;
    openerByOverlay.delete(overlay);
    const top = getTopOverlay();
    const focusLost = !document.activeElement || document.activeElement === document.body;
    if (opener && opener.isConnected && focusLost && (!top || top.contains(opener))) {
      opener.focus({ preventScroll: true });
    }
  }
}

function isLabelled(control: HTMLElement): boolean {
  if (control.getAttribute('aria-label') || control.getAttribute('aria-labelledby')) return true;
  if (control.closest('label')) return true;
  return !!control.id && document.querySelector(`label[for="${CSS.escape(control.id)}"]`) !== null;
}

/** Find the single form control a bare label is describing: the next sibling that is, or wraps, exactly one control. */
function findControlAfter(start: HTMLElement): HTMLElement | null {
  let sibling = start.nextElementSibling as HTMLElement | null;
  while (sibling) {
    if (sibling.matches('label') || sibling.querySelector('label')) return null;
    if (sibling.matches(CONTROL_SELECTOR)) return sibling;
    const nested = sibling.querySelectorAll<HTMLElement>(CONTROL_SELECTOR);
    if (nested.length === 1) return nested[0]!;
    if (nested.length > 1) return null;
    sibling = sibling.nextElementSibling as HTMLElement | null;
  }
  return null;
}

/**
 * Find the single form control a bare label is describing: the next sibling
 * that is, or wraps, exactly one control. When the label sits in a header row
 * of its own (label + helper buttons), look after that row instead.
 */
function findControlFor(label: HTMLLabelElement): HTMLElement | null {
  const direct = findControlAfter(label);
  if (direct) return direct;
  const row = label.parentElement;
  if (!row || row.querySelector(CONTROL_SELECTOR) || row.querySelectorAll('label').length !== 1) return null;
  return findControlAfter(row);
}

function linkLabels() {
  const labels = document.querySelectorAll<HTMLLabelElement>('label:not([for])');
  labels.forEach((label) => {
    if (label.querySelector(CONTROL_SELECTOR)) return; // already wraps its control
    const control = findControlFor(label);
    if (!control || isLabelled(control)) return;
    if (!control.id) control.id = nextId('field');
    label.htmlFor = control.id;
  });
}

function scan() {
  releaseClosedOverlays();
  document.querySelectorAll<HTMLElement>(OVERLAY_SELECTOR).forEach(prepareOverlay);
  linkLabels();
}

function handleKeyDownCapture(e: KeyboardEvent) {
  if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return;
  const overlay = getTopOverlay();
  if (!overlay) return;
  const close = findCloseControl(overlay);
  if (!close || (close as HTMLButtonElement).disabled) return;
  e.preventDefault();
  e.stopPropagation();
  close.click();
}

function handleTab(e: KeyboardEvent) {
  if (e.key !== 'Tab') return;
  const overlay = getTopOverlay();
  if (!overlay) return;

  const focusable = getFocusable(overlay);
  if (focusable.length === 0) {
    e.preventDefault();
    overlay.focus({ preventScroll: true });
    return;
  }
  const first = focusable[0]!;
  const last = focusable[focusable.length - 1]!;
  const active = document.activeElement as HTMLElement | null;

  if (!active || !overlay.contains(active) || active === overlay) {
    e.preventDefault();
    (e.shiftKey ? last : first).focus();
  } else if (e.shiftKey && active === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}

/** Install once at app start-up. Safe to call more than once. */
export function installModalA11y() {
  if (installed || typeof document === 'undefined') return;
  installed = true;

  // Mutation callbacks are already batched per task, and scan() only touches
  // attributes (never the child list), so it cannot re-trigger itself. Running
  // it here rather than on an animation frame keeps it working in tabs that
  // are not currently being painted.
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('keydown', handleKeyDownCapture, true);
  document.addEventListener('keydown', handleTab);
  scan();
}
