import { useRef, useState } from 'react';
import { copy } from '../../copy.js';
import { copyText } from '../../lib/clipboard.js';
import styles from './Confirmation.module.css';

type State = 'idle' | 'copied' | 'failed';

/**
 * Copies the link: Clipboard API, then the execCommand fallback (plain http), and only if both
 * fail, selects the link so the parent can copy it themselves.
 */
export function CopyLinkButton({ link }: { link: string }) {
  const [state, setState] = useState<State>('idle');
  const inputRef = useRef<HTMLInputElement>(null);

  async function copyLink() {
    if (await copyText(link)) {
      setState('copied');
      return;
    }
    inputRef.current?.focus();
    inputRef.current?.select();
    setState('failed');
  }

  return (
    <div className={styles.linkRow}>
      <label className="visually-hidden" htmlFor="class-link">
        {copy.linkLabel}
      </label>
      <input
        id="class-link"
        ref={inputRef}
        className={styles.linkInput}
        value={link}
        readOnly
        onFocus={(e) => e.currentTarget.select()}
      />
      <button type="button" className={styles.copyButton} onClick={() => void copyLink()}>
        {state === 'copied' ? '✓ ' : ''}
        {copy.copyLink}
      </button>
      <p className={styles.copyStatus} role="status" aria-live="polite">
        {state === 'copied' ? copy.copied : state === 'failed' ? copy.copyFailed : ''}
      </p>
    </div>
  );
}
