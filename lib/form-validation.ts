type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const watched = new WeakSet<HTMLElement>();

const containerOf = (control: Element) => control.closest<HTMLElement>("[data-field]") ?? control.closest<HTMLElement>("label");

function messageFor(control: Control) {
  if (control.validity.customError) return control.validationMessage;
  if ((control.validity.patternMismatch || control.validity.typeMismatch) && control.title) return control.title;
  if (control.validity.typeMismatch && control.type === "email") return "Enter a valid email address";
  if (!control.validity.valueMissing) return control.validationMessage;
  return control.closest<HTMLElement>("[data-required-message]")?.dataset.requiredMessage ?? "This field is required";
}

function refresh(root: HTMLElement) {
  const errors = new Map<HTMLElement, string>();
  root.querySelectorAll<Control>("input, select, textarea").forEach((control) => {
    const valid = control.checkValidity();
    if (valid) control.removeAttribute("aria-invalid");
    else control.setAttribute("aria-invalid", "true");
    const container = containerOf(control);
    if (!valid && container && !errors.has(container)) errors.set(container, messageFor(control));
  });
  root.querySelectorAll<HTMLElement>("[data-error]").forEach((container) => { if (!errors.has(container)) delete container.dataset.error; });
  errors.forEach((message, container) => { container.dataset.error = message; });
  return errors.size === 0;
}

// Flags every invalid field under `root` in red and keeps the flags in sync while the person edits,
// so each message clears as soon as that field is filled in. Returns true when everything is valid.
export function validateFields(root: HTMLElement | null) {
  if (!root) return true;
  if (!watched.has(root)) {
    watched.add(root);
    // Wait for React to commit, since some `required` attributes depend on state (e.g. multi-select).
    const recheck = () => window.setTimeout(() => refresh(root));
    root.addEventListener("input", recheck);
    root.addEventListener("change", recheck);
  }
  const valid = refresh(root);
  const first = root.querySelector<Control>("[aria-invalid='true']");
  if (first) {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    first.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
    first.focus({ preventScroll: true });
  }
  return valid;
}
