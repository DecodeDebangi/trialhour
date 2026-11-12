import { formatInstant, type OutboxEntry, type OutboxMessageDto } from '@codeyoung/shared';
import { copy } from '../../copy.js';
import styles from './Outbox.module.css';

interface EmailCardProps {
  who: 'parent' | 'mentor';
  message: OutboxMessageDto;
  time: string;
  secondaryTime?: string;
}

function EmailCard({ who, message, time, secondaryTime }: EmailCardProps) {
  const label = who === 'parent' ? copy.toParent : copy.toMentor;
  return (
    <article className={styles.email} aria-label={label}>
      <span
        className={`${styles.badge} ${who === 'parent' ? styles.parentBadge : styles.mentorBadge}`}
      >
        {label}
      </span>
      <div className={styles.time}>
        <p className={styles.timeLabel}>{copy.classTimeInEmail}</p>
        <p className={styles.timeMain}>{time}</p>
        {secondaryTime && <p className={styles.timeSecondary}>{secondaryTime}</p>}
      </div>
      <dl className={styles.meta}>
        <dt>{copy.emailTo}</dt>
        <dd>{message.to}</dd>
        <dt>{copy.emailSubject}</dt>
        <dd>{message.subject}</dd>
      </dl>
      <pre className={styles.body}>{message.body}</pre>
    </article>
  );
}

/** One booking's two emails, side by side on wide screens and stacked on phones. */
export function EmailPair({ entry }: { entry: OutboxEntry }) {
  const parentTime = formatInstant(entry.startUtc, entry.parentTimezone);
  return (
    <section aria-labelledby={`entry-${entry.bookingId}`}>
      <div className={styles.entryHeader}>
        <h2 id={`entry-${entry.bookingId}`} className={styles.entryTitle}>
          {copy.outboxBookingHeading(entry.childName, entry.mentorName)}
        </h2>
        <p className={styles.sent}>{copy.outboxSent(formatInstant(entry.sentAt, 'UTC'))}</p>
      </div>
      <div className={styles.pair}>
        <EmailCard who="parent" message={entry.parent} time={parentTime} />
        <EmailCard
          who="mentor"
          message={entry.mentor}
          time={formatInstant(entry.startUtc, entry.mentorTimezone)}
          secondaryTime={copy.parentsTime(parentTime)}
        />
      </div>
    </section>
  );
}
