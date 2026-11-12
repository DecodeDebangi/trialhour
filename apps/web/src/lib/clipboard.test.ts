import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyText } from './clipboard.js';

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true });
}
function setExecCommand(value: unknown) {
  Object.defineProperty(document, 'execCommand', { value, configurable: true });
}

afterEach(() => {
  vi.restoreAllMocks();
  delete (document as { execCommand?: unknown }).execCommand;
});

describe('copyText', () => {
  it('uses the Clipboard API when it works, without touching execCommand', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const exec = vi.fn(() => true);
    setClipboard({ writeText });
    setExecCommand(exec);
    expect(await copyText('hello')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
    expect(exec).not.toHaveBeenCalled();
  });

  it('falls back to execCommand when the Clipboard API is missing or refused', async () => {
    const exec = vi.fn(() => true);
    setExecCommand(exec);
    setClipboard(undefined);
    expect(await copyText('hello')).toBe(true);
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('denied')) });
    expect(await copyText('hello')).toBe(true);
    expect(exec).toHaveBeenCalledTimes(2);
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('returns false when execCommand is missing, refuses or throws', async () => {
    setClipboard(undefined);
    setExecCommand(undefined);
    expect(await copyText('hello')).toBe(false);
    setExecCommand(() => false);
    expect(await copyText('hello')).toBe(false);
    setExecCommand(() => {
      throw new Error('SecurityError');
    });
    expect(await copyText('hello')).toBe(false);
    expect(document.querySelector('textarea')).toBeNull();
  });
});
