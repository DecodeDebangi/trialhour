import { useId, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  bookingRequestSchema,
  formatInstant,
  type BookingRequest,
  type BookingResponse,
  type SlotDto,
} from '@codeyoung/shared';
import { ApiError, api, type Alternative, type ExistingTrial } from '../../api/client.js';
import { copy } from '../../copy.js';
import { DIAL_CODES, dialCodeForZone, toE164 } from '../../lib/phone.js';
import { newUuid } from '../../lib/uuid.js';
import { Notice } from '../../components/Notice.js';
import styles from './BookingForm.module.css';

type Field = 'childName' | 'childGrade' | 'parentName' | 'parentEmail' | 'phone';
const FIELD_ORDER: Field[] = ['childName', 'childGrade', 'parentName', 'parentEmail', 'phone'];
const FIELD_LABELS: Record<Field, string> = {
  childName: copy.childName,
  childGrade: copy.childGrade,
  parentName: copy.parentName,
  parentEmail: copy.parentEmail,
  phone: copy.phone,
};

export interface ParentPrefill {
  parentName?: string;
  parentEmail?: string;
}

interface BookingFormProps {
  slot: SlotDto;
  zone: string;
  prefill?: ParentPrefill;
  onBooked: (booking: BookingResponse) => void;
  /** The slot was taken while the parent filled in the form and there's nothing to offer. */
  onUnavailable: (error: ApiError) => void;
  /** Availability changed (a 409 happened); the page should refresh its slots. */
  onSlotsStale: () => void;
  onChangeTime: () => void;
}

interface Conflict {
  title: string;
  alternatives: readonly Alternative[];
}

export function BookingForm({
  slot,
  zone,
  prefill,
  onBooked,
  onUnavailable,
  onSlotsStale,
  onChangeTime,
}: BookingFormProps) {
  const id = useId();
  const fieldId = (f: Field) => `${id}-${f}`;
  const [values, setValues] = useState({
    childName: '',
    childGrade: '',
    parentName: prefill?.parentName ?? '',
    parentEmail: prefill?.parentEmail ?? '',
    phoneLocal: '',
  });
  const [dial, setDial] = useState<string>(() => dialCodeForZone(zone));
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  // Picked from the conflict panel but not yet confirmed: no cancelling, so no one-tap booking.
  const [chosenAlternative, setChosenAlternative] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<ExistingTrial | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const conflictRef = useRef<HTMLDivElement>(null);
  // Same payload → same Idempotency-Key, so "Try again" after a network error is safe to repeat.
  // Any change (another time, edited details) gets a fresh key.
  const lastAttempt = useRef<{ payload: string; key: string } | null>(null);

  function keyFor(request: BookingRequest): string {
    const payload = JSON.stringify(request);
    if (lastAttempt.current?.payload !== payload) {
      lastAttempt.current = { payload, key: newUuid() };
    }
    return lastAttempt.current.key;
  }

  const set = (key: keyof typeof values) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  function validate(startUtc: string): {
    request?: BookingRequest;
    errors: Partial<Record<Field, string>>;
  } {
    const found: Partial<Record<Field, string>> = {};
    const phone = toE164(dial, values.phoneLocal);
    if (!phone.ok) found.phone = copy.fieldErrors.phone;
    const parsed = bookingRequestSchema.safeParse({
      startUtc,
      parentTimezone: zone,
      childName: values.childName,
      childGrade: values.childGrade ? Number(values.childGrade) : undefined,
      parentName: values.parentName,
      parentEmail: values.parentEmail,
      ...(phone.ok && phone.value ? { phone: phone.value } : {}),
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as Field;
        if (FIELD_ORDER.includes(field)) found[field] = copy.fieldErrors[field];
      }
    }
    return Object.keys(found).length === 0 && parsed.success
      ? { request: parsed.data, errors: {} }
      : { errors: found };
  }

  const conflictTitle = (error: ApiError, startUtc: string) =>
    copy.conflictTitle(error.reason, formatInstant(startUtc, zone));

  /** Submits for the chosen slot, or for an alternative picked from the conflict panel. */
  async function submit(e?: FormEvent, startUtc: string = slot.startUtc) {
    e?.preventDefault();
    setFormError(null);
    setDuplicate(null);
    const { request, errors: found } = validate(startUtc);
    setErrors(found);
    if (!request) {
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    setSubmitting(true);
    try {
      onBooked(await api.createBooking(request, keyFor(request)));
    } catch (error) {
      if (!(error instanceof ApiError)) {
        // Never fail silently: anything unexpected still tells the parent and offers a retry.
        setFormError(copy.serverError);
        return;
      }
      if (error.kind === 'unavailable' && error.alternatives.length > 0) {
        setConflict({ title: conflictTitle(error, startUtc), alternatives: error.alternatives });
        setChosenAlternative(null);
        onSlotsStale();
        requestAnimationFrame(() => conflictRef.current?.focus());
      } else if (error.kind === 'unavailable') {
        onUnavailable(error);
      } else if (error.kind === 'duplicate' && error.existingBooking) {
        setConflict(null);
        setDuplicate(error.existingBooking);
      } else if (error.kind === 'validation') {
        const serverErrors: Partial<Record<Field, string>> = {};
        for (const [path, message] of Object.entries(error.fieldErrors)) {
          if (FIELD_ORDER.includes(path as Field)) serverErrors[path as Field] = message;
        }
        setErrors(serverErrors);
        if (Object.keys(serverErrors).length === 0) setFormError(copy.slotNoLongerOffered);
      } else {
        setFormError(error.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const errorList = FIELD_ORDER.filter((f) => errors[f]);
  const describedBy = (f: Field, hint?: boolean) =>
    [hint ? `${fieldId(f)}-hint` : '', errors[f] ? `${fieldId(f)}-error` : '']
      .filter(Boolean)
      .join(' ') || undefined;
  const errorText = (f: Field) =>
    errors[f] ? (
      <p id={`${fieldId(f)}-error`} className={styles.error}>
        {errors[f]}
      </p>
    ) : null;

  return (
    <section className={styles.section} aria-labelledby={`${id}-summary`} id="booking-form">
      <div className={styles.summary}>
        <div>
          <p className={styles.summaryLabel}>{copy.summaryLabel}</p>
          <h2 id={`${id}-summary`} className={styles.summaryWhen} tabIndex={-1}>
            {formatInstant(slot.startUtc, zone)}
          </h2>
        </div>
        <button type="button" className={styles.linkButton} onClick={onChangeTime}>
          {copy.changeTime}
        </button>
      </div>

      <form className={styles.form} onSubmit={submit} noValidate>
        <h3 className={styles.formHeading}>{copy.formHeading}</h3>

        {errorList.length > 0 && (
          <div className={styles.errorSummary} role="alert" tabIndex={-1} ref={summaryRef}>
            <h3>{copy.errorSummary}</h3>
            <ul>
              {errorList.map((f) => (
                <li key={f}>
                  <a href={`#${fieldId(f)}`}>{FIELD_LABELS[f]}</a>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor={fieldId('childName')}>
              {copy.childName}
            </label>
            <input
              id={fieldId('childName')}
              name="childFirstName"
              className={styles.input}
              value={values.childName}
              onChange={set('childName')}
              autoComplete="off"
              // Keep password managers from treating the child's name as a username.
              data-1p-ignore=""
              data-lpignore="true"
              data-form-type="other"
              required
              aria-invalid={!!errors.childName}
              aria-describedby={describedBy('childName')}
            />
            {errorText('childName')}
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor={fieldId('childGrade')}>
              {copy.childGrade}
            </label>
            <select
              id={fieldId('childGrade')}
              name="childGrade"
              className={`${styles.input} ${styles.select}`}
              value={values.childGrade}
              onChange={set('childGrade')}
              autoComplete="off"
              required
              aria-invalid={!!errors.childGrade}
              aria-describedby={describedBy('childGrade')}
            >
              <option value="" disabled>
                {copy.childGradePlaceholder}
              </option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((g) => (
                <option key={g} value={g}>
                  {copy.grade(g)}
                </option>
              ))}
            </select>
            {errorText('childGrade')}
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor={fieldId('parentName')}>
            {copy.parentName}
          </label>
          <input
            id={fieldId('parentName')}
            name="name"
            className={styles.input}
            required
            value={values.parentName}
            onChange={set('parentName')}
            autoComplete="name"
            aria-invalid={!!errors.parentName}
            aria-describedby={describedBy('parentName')}
          />
          {errorText('parentName')}
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor={fieldId('parentEmail')}>
            {copy.parentEmail}
          </label>
          <p id={`${fieldId('parentEmail')}-hint`} className={styles.hint}>
            {copy.parentEmailHint}
          </p>
          <input
            id={fieldId('parentEmail')}
            name="email"
            className={styles.input}
            required
            type="email"
            inputMode="email"
            value={values.parentEmail}
            onChange={set('parentEmail')}
            autoComplete="email"
            aria-invalid={!!errors.parentEmail}
            aria-describedby={describedBy('parentEmail', true)}
          />
          {errorText('parentEmail')}
        </div>

        <fieldset className={`${styles.fieldset} ${styles.field}`}>
          <legend className={styles.label}>{copy.phone}</legend>
          <p id={`${fieldId('phone')}-hint`} className={styles.hint}>
            {copy.phoneHint}
          </p>
          <div className={styles.phoneRow}>
            <label className="visually-hidden" htmlFor={`${fieldId('phone')}-dial`}>
              {copy.dialCode}
            </label>
            <select
              id={`${fieldId('phone')}-dial`}
              name="phoneCountryCode"
              className={`${styles.input} ${styles.select}`}
              autoComplete="tel-country-code"
              value={dial}
              onChange={(e) => setDial(e.target.value)}
            >
              {DIAL_CODES.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.label}
                </option>
              ))}
            </select>
            <label className="visually-hidden" htmlFor={fieldId('phone')}>
              {copy.phoneNumber}
            </label>
            <input
              id={fieldId('phone')}
              name="phone"
              className={styles.input}
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              value={values.phoneLocal}
              onChange={set('phoneLocal')}
              aria-invalid={!!errors.phone}
              aria-describedby={describedBy('phone', true)}
            />
          </div>
          {errorText('phone')}
        </fieldset>

        {conflict && (
          <div className={styles.conflict} role="alert" tabIndex={-1} ref={conflictRef}>
            <h3 className={styles.conflictTitle}>{conflict.title}</h3>
            <p className={styles.conflictLead}>{copy.conflictLead}</p>
            <ul className={styles.alternatives}>
              {conflict.alternatives.map((alt) => (
                <li key={alt.startUtc}>
                  <button
                    type="button"
                    className={styles.alternative}
                    aria-pressed={chosenAlternative === alt.startUtc}
                    disabled={submitting}
                    onClick={() => setChosenAlternative(alt.startUtc)}
                  >
                    <span aria-hidden="true" className={styles.radio} />
                    {formatInstant(alt.startUtc, zone)}
                  </button>
                </li>
              ))}
            </ul>
            {chosenAlternative && (
              <button
                type="button"
                className={styles.submit}
                aria-busy={submitting}
                disabled={submitting}
                onClick={() => void submit(undefined, chosenAlternative)}
              >
                {submitting
                  ? copy.submitting
                  : copy.bookThis(formatInstant(chosenAlternative, zone))}
              </button>
            )}
            <button type="button" className={styles.linkButton} onClick={onChangeTime}>
              {copy.pickAnother}
            </button>
          </div>
        )}

        {duplicate && (
          <div className={styles.duplicate} role="alert">
            <p>
              <strong>
                {copy.duplicateTrial(duplicate.childName, formatInstant(duplicate.startUtc, zone))}
              </strong>
            </p>
            <p>
              <Link to={`/bookings/${duplicate.id}`}>{copy.viewThatBooking}</Link>
            </p>
            <p className={styles.hint}>{copy.duplicateHint}</p>
          </div>
        )}

        {formError && (
          <Notice
            tone="error"
            message={formError}
            actionLabel={copy.tryAgain}
            onAction={() => void submit()}
          />
        )}

        <button
          type="submit"
          className={styles.submit}
          aria-busy={submitting}
          disabled={submitting}
        >
          {submitting ? copy.submitting : copy.submit}
        </button>
      </form>
    </section>
  );
}
