import { useId, useMemo, useState } from 'react';
import { copy } from '../../copy.js';
import { now } from '../../lib/clock.js';
import { COMMON_ZONES, otherZones, zoneOptionLabel } from '../../lib/zones.js';
import styles from './ZoneBar.module.css';

interface ZoneBarProps {
  zone: string | null;
  onChange: (zone: string) => void;
}

function ClockIcon() {
  return (
    <svg className={styles.clock} width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 7v5l3 2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Shows which zone times are in; lets the parent change it. Asks when detection failed. */
export function ZoneBar({ zone, onChange }: ZoneBarProps) {
  const [open, setOpen] = useState(false);
  const selectId = useId();
  const at = useMemo(() => now(), []);
  const others = useMemo(() => otherZones(), []);
  const showPicker = open || zone === null;

  return (
    <section
      className={`${styles.bar} ${zone === null ? styles.prompt : ''}`}
      aria-label="Time zone"
    >
      <ClockIcon />
      <p className={styles.text}>
        {zone === null ? (
          copy.zoneNotDetected
        ) : (
          <>
            {copy.zoneShownIn} <strong>{zoneOptionLabel(zone, at)}</strong>
          </>
        )}
      </p>
      {zone !== null && (
        <button
          type="button"
          className={styles.change}
          aria-expanded={open}
          aria-controls={selectId}
          onClick={() => setOpen((o) => !o)}
        >
          {copy.zoneChange}
        </button>
      )}
      {showPicker && (
        <div className={styles.picker}>
          <label htmlFor={selectId} className={styles.label}>
            {copy.zonePickerLabel}
          </label>
          <select
            id={selectId}
            className={styles.select}
            value={zone ?? ''}
            onChange={(e) => {
              onChange(e.target.value);
              setOpen(false);
            }}
          >
            {zone === null && <option value="">Choose your time zone…</option>}
            <optgroup label={copy.zoneCommonGroup}>
              {COMMON_ZONES.map((z) => (
                <option key={z} value={z}>
                  {zoneOptionLabel(z, at)}
                </option>
              ))}
            </optgroup>
            <optgroup label={copy.zoneAllGroup}>
              {others.map((z) => (
                <option key={z} value={z}>
                  {z.replaceAll('_', ' ')} · {zoneOptionLabel(z, at)}
                </option>
              ))}
            </optgroup>
          </select>
        </div>
      )}
    </section>
  );
}
