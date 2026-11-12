import { useRef, useState } from 'react';
import { copy } from '../../copy.js';
import styles from './Confirmation.module.css';

type State = 'idle' | 'copied' | 'failed';

/** Copies the link; if the Clipboard API is missing or refused, selects the text instead. */
export function CopyLinkButton({ link }: { link: string }) {
  const [state, setState] = useState<State>('idle');
  const inputRef = useRef<HTMLInputElement>(null);

  async function copyLink() {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(link);
      setState('copied');
    } catch {
      inputRef.current?.focus();
      inputRef.current?.select();
      setState('failed');
    }
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
