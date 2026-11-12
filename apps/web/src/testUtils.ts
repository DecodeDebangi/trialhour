/** Text an element's aria-describedby points at (what a screen reader reads as its description). */
export function description(el: Element): string {
  return (el.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
    .join(' ');
}
