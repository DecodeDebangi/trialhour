import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import {
  bookingRequestSchema,
  formatInstant,
  type BookingRequest,
  type BookingResponse,
  type SlotDto,
} from '@codeyoung/shared';
import { ApiError, api } from '../../api/client.js';
import { copy } from '../../copy.js';
import { DIAL_CODES, dialCodeForZone, toE164 } from '../../lib/phone.js';
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
  /** The slot was taken (or became too soon) while the parent filled in the form. */
  onUnavailable: (error: ApiError) => void;
  onChangeTime: () => void;
}

export function BookingForm({
  slot,
  zone,
  prefill,
  onBooked,
  onUnavailable,
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
  const summaryRef = useRef<HTMLDivElement>(null);
  // One key per attempt at this slot: a retry after a network error reuses it (safe to repeat).
  const idempotencyKey = useRef(crypto.randomUUID());

  useEffect(() => {
    idempotencyKey.current = crypto.randomUUID();
  }, [slot.startUtc]);

  const set = (key: keyof typeof values) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  function validate(): { request?: BookingRequest; errors: Partial<Record<Field, string>> } {
    const found: Partial<Record<Field, string>> = {};
    const phone = toE164(dial, values.phoneLocal);
    if (!phone.ok) found.phone = copy.fieldErrors.phone;
    const parsed = bookingRequestSchema.safeParse({
      startUtc: slot.startUtc,
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

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    setFormError(null);
    const { request, errors: found } = validate();
    setErrors(found);
    if (!request) {
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    setSubmitting(true);
    try {
      onBooked(await api.createBooking(request, idempotencyKey.current));
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      if (error.kind === 'unavailable') {
        onUnavailable(error);
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
