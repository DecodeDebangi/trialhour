import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import type { BookingResponse } from '@codeyoung/shared';
import { ApiError, api } from '../api/client.js';
import { Layout } from '../components/Layout.js';
import { Notice } from '../components/Notice.js';
import { copy } from '../copy.js';
import { ConfirmationView } from '../features/confirmation/ConfirmationView.js';

type State =
  | { status: 'loading' }
  | { status: 'ready'; booking: BookingResponse }
  | { status: 'error'; error: ApiError };

/** Uses the booking handed over by the form when present; otherwise (refresh, shared link) fetches it. */
export function ConfirmationPage() {
  const { id = '' } = useParams();
  const handedOver = (useLocation().state as { booking?: BookingResponse } | null)?.booking;
  const [state, setState] = useState<State>(
    handedOver?.id === id ? { status: 'ready', booking: handedOver } : { status: 'loading' },
  );
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (state.status === 'ready' && state.booking.id === id) return;
    let cancelled = false;
    setState({ status: 'loading' });
    api.getBooking(id).then(
      (booking) => !cancelled && setState({ status: 'ready', booking }),
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
    // Deliberately keyed on id and retry attempt only; `state` is read, not a trigger.
  }, [id, attempt]);

  useEffect(() => {
    if (state.status === 'ready') document.getElementById('booked-title')?.focus();
  }, [state.status]);

  return (
    <Layout>
      {state.status === 'loading' && <p role="status">{copy.loadingBooking}</p>}
      {state.status === 'error' &&
        (state.error.kind === 'not-found' || state.error.kind === 'validation' ? (
          <>
            <Notice tone="info" message={copy.bookingNotFound} />
            <Link to="/">{copy.bookNew}</Link>
          </>
        ) : (
          <Notice
            tone="error"
            message={state.error.message}
            actionLabel={copy.tryAgain}
            onAction={() => setAttempt((a) => a + 1)}
          />
        ))}
      {state.status === 'ready' && <ConfirmationView booking={state.booking} />}
    </Layout>
  );
}
