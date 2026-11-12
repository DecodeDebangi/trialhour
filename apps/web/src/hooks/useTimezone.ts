import { useCallback, useState } from 'react';
import { isValidZone } from '@codeyoung/shared';
import { detectZone } from '../lib/zones.js';

const STORAGE_KEY = 'trialhour.timezone';

function readSaved(): string | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved && isValidZone(saved) ? saved : null;
  } catch {
    return null;
  }
}

/** Parent's zone: saved choice, else browser-detected, else null (ask them). */
export function useTimezone() {
  const [zone, setZoneState] = useState<string | null>(() => readSaved() ?? detectZone());

  const setZone = useCallback((next: string) => {
    if (!isValidZone(next)) return;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private mode or blocked storage: the choice still applies for this visit.
    }
    setZoneState(next);
  }, []);

  return { zone, setZone };
}
