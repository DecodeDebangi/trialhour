/** Async Clipboard API: only available in secure contexts (https or localhost). */
async function copyWithClipboardApi(text: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false; // missing permission or not a user gesture
  }
}

/**
 * Legacy fallback that also works on plain http (e.g. http://192.168.x.x): put the text in a
 * temporary, invisible textarea, select it and run the browser's copy command. Deprecated, but
 * still supported by every major browser, and the only option outside a secure context.
 */
function copyWithExecCommand(text: string): boolean {
  if (typeof document.execCommand !== 'function') return false;
  const previouslyFocused = document.activeElement as HTMLElement | null;
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', ''); // no on-screen keyboard on phones
  area.setAttribute('aria-hidden', 'true');
  Object.assign(area.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '1px',
    height: '1px',
    opacity: '0',
    fontSize: '16px', // stops iOS zooming in on focus
  });
  document.body.appendChild(area);
  try {
    area.focus();
    area.select();
    area.setSelectionRange(0, text.length); // iOS ignores select() on its own
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
    previouslyFocused?.focus?.();
  }
}

/** Copies text with the best method the page allows. Resolves false if nothing worked. */
export async function copyText(text: string): Promise<boolean> {
  return (await copyWithClipboardApi(text)) || copyWithExecCommand(text);
}
