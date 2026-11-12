import { useCallback, useEffect, useState } from 'react';
import type { SlotsResponse } from '@codeyoung/shared';
import { ApiError, api } from '../api/client.js';

interface SlotsState {
  data: SlotsResponse | null;
  error: ApiError | null;
  loading: boolean;
}

/** Loads the whole booking horizon for a zone; `reload` keeps showing old data meanwhile. */
export function useSlots(zone: string | null) {
  const [state, setState] = useState<SlotsState>({ data: null, error: null, loading: !!zone });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!zone) return;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    api.getSlots(zone).then(
      (data) => !cancelled && setState({ data, error: null, loading: false }),
      (error: unknown) =>
        !cancelled &&
        setState((s) => ({
          ...s,
          loading: false,
          error: error instanceof ApiError ? error : new ApiError('server', String(error)),
        })),
    );
    return () => {
      cancelled = true;
    };
  }, [zone, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { ...state, reload };
}
