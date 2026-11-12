import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { OutboxResponse } from '@codeyoung/shared';
import { ApiError, api } from '../api/client.js';
import { Layout } from '../components/Layout.js';
import { Notice } from '../components/Notice.js';
import { copy } from '../copy.js';
import { EmailPair } from '../features/outbox/EmailPair.js';
import styles from '../features/outbox/Outbox.module.css';

type State =
  | { status: 'loading' }
  | { status: 'ready'; data: OutboxResponse }
  | { status: 'error'; error: ApiError };

/** The mock outbox: how a reviewer sees that each side gets the class in their own time. */
export function OutboxPage() {
  const [params] = useSearchParams();
  const bookingId = params.get('booking') ?? undefined;
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    api.getOutbox(bookingId).then(
      (data) => !cancelled && setState({ status: 'ready', data }),
      (error: unknown) =>
        !cancelled &&
        setState({
          status: 'error',
          error: error instanceof ApiError ? error : new ApiError('server', copy.serverError),
        }),
    );
    return () => {
      cancelled = true;
    };
  }, [bookingId, attempt]);

  return (
    <Layout wide>
      <h1>{copy.outboxTitle}</h1>
      <p className={styles.intro}>{copy.outboxIntro}</p>

      {bookingId && (
        <div className={styles.filter}>
          <p>{copy.outboxFiltered}</p>
          <Link to="/outbox">{copy.outboxShowAll}</Link>
        </div>
      )}

      {state.status === 'loading' && <p role="status">{copy.outboxLoading}</p>}
      {state.status === 'error' && (
        <Notice
          tone="error"
          message={state.error.message}
          actionLabel={copy.tryAgain}
          onAction={() => setAttempt((a) => a + 1)}
        />
      )}
      {state.status === 'ready' && state.data.entries.length === 0 && (
        <Notice tone="info" message={copy.outboxEmpty} />
      )}
      {state.status === 'ready' && state.data.entries.length > 0 && (
        <ol className={styles.entries}>
          {state.data.entries.map((entry) => (
            <li key={entry.bookingId}>
              <EmailPair entry={entry} />
            </li>
          ))}
        </ol>
      )}
    </Layout>
  );
}
