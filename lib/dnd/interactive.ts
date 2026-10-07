/** Targets that must not start long-press / paint-select / drag. */
const INTERACTIVE_SELECTOR = [
  "button",
  "a",
  "input",
  "select",
  "textarea",
  "label",
  "[role='button']",
  "[role='menuitem']",
  "[role='option']",
  "[data-dnd-ignore]",
].join(",");

/** Overlays where empty-space clicks must not exit multi-select. */
const OVERLAY_SELECTOR = [
  "[role='dialog']",
  "[role='menu']",
  "[role='listbox']",
  "[data-radix-popper-content-wrapper]",
  "[data-sonner-toaster]",
  "[data-bulk-actions]",
].join(",");

function asElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target;
  // Clicks on text nodes still belong to their parent element.
  if (target instanceof Node) return target.parentElement;
  return null;
}

export function isInteractiveTarget(target: EventTarget | null): boolean {
  const el = asElement(target);
  if (!el) return false;
  return Boolean(el.closest(INTERACTIVE_SELECTOR));
}

/** True when the event is inside a dialog/menu/popover/flyout portal. */
export function isOverlayTarget(target: EventTarget | null): boolean {
  const el = asElement(target);
  if (!el) return false;
  return Boolean(el.closest(OVERLAY_SELECTOR));
}

export function findItemIdFromPoint(clientX: number, clientY: number): string | null {
  if (typeof document === "undefined") return null;
  const el = document.elementFromPoint(clientX, clientY);
  if (!(el instanceof Element)) return null;
  const item = el.closest("[data-dnd-item-id]");
  if (!(item instanceof HTMLElement)) return null;
  return item.dataset.dndItemId ?? null;
}

export function findDropZoneFromPoint(
  clientX: number,
  clientY: number
): string | null {
  if (typeof document === "undefined") return null;
  const el = document.elementFromPoint(clientX, clientY);
  if (!(el instanceof Element)) return null;
  const zone = el.closest("[data-dnd-drop-zone]");
  if (!(zone instanceof HTMLElement)) return null;
  return zone.dataset.dndDropZone ?? null;
}

export function findInsertIndexFromPoint(
  clientX: number,
  clientY: number,
  pageItemIds: string[]
): number | null {
  if (typeof document === "undefined" || pageItemIds.length === 0) return null;

  const el = document.elementFromPoint(clientX, clientY);
  if (!(el instanceof Element)) return null;
  const item = el.closest("[data-dnd-item-id]");
  if (!(item instanceof HTMLElement)) return null;

  const id = item.dataset.dndItemId;
  if (!id) return null;
  const indexInPage = pageItemIds.indexOf(id);
  if (indexInPage < 0) return null;

  const rect = item.getBoundingClientRect();
  const after = clientY > rect.top + rect.height / 2;
  return after ? indexInPage + 1 : indexInPage;
}
