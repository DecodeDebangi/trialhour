import styles from './Notice.module.css';

interface NoticeProps {
  tone: 'error' | 'info';
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** An inline message with an optional action. Errors are announced (role="alert"). */
export function Notice({ tone, message, actionLabel, onAction }: NoticeProps) {
  return (
    <div
      className={`${styles.notice} ${styles[tone]}`}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <span className={styles.icon} aria-hidden="true">
        {tone === 'error' ? '!' : 'i'}
      </span>
      <p className={styles.text}>{message}</p>
      {actionLabel && onAction && (
        <button type="button" className={styles.action} onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
