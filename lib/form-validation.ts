type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const DEFAULT_REQUIRED_MESSAGE = "This field is required";
const INVALID_EMAIL_MESSAGE = "Enter a valid email address";

const watched = new WeakSet<HTMLElement>();

const containerOf = (control: Element) => control.closest<HTMLElement>("[data-field]") ?? control.closest<HTMLElement>("label");

function messageFor(control: Control) {
  if (control.validity.customError) return control.validationMessage;
  if ((control.validity.patternMismatch || control.validity.typeMismatch) && control.title) return control.title;
  if (control.validity.typeMismatch && control.type === "email") return INVALID_EMAIL_MESSAGE;
  if (!control.validity.valueMissing) return control.validationMessage;
  return control.closest<HTMLElement>("[data-required-message]")?.dataset.requiredMessage ?? DEFAULT_REQUIRED_MESSAGE;
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
  root.querySelectorAll<HTMLElement>("[data-error]").forEach((container) => {
    if (!errors.has(container)) delete container.dataset.error;
  });
  errors.forEach((message, container) => { container.dataset.error = message; });
  return errors.size === 0;
}

function recheckAfterReactCommits(root: HTMLElement) {
  if (watched.has(root)) return;
  watched.add(root);
  const recheck = () => window.setTimeout(() => refresh(root));
  root.addEventListener("input", recheck);
  root.addEventListener("change", recheck);
}

export function scrollIntoViewCentered(element: Element) {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  element.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
}

export function validateFields(root: HTMLElement | null) {
  if (!root) return true;
  recheckAfterReactCommits(root);
  const valid = refresh(root);
  const first = root.querySelector<Control>("[aria-invalid='true']");
  if (first) {
    scrollIntoViewCentered(first);
    first.focus({ preventScroll: true });
  }
  return valid;
}
