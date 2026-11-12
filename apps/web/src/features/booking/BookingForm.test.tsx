import { afterEach, describe, expect, it, vi } from 'vitest';
import { description } from '../../testUtils.js';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ApiError, api } from '../../api/client.js';
import { BookingForm } from './BookingForm.js';
import { slot } from '../../testFixtures.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const LONDON = 'Europe/London';
const theSlot = slot('2026-11-13T16:00:00Z');

function renderForm(overrides: Partial<Parameters<typeof BookingForm>[0]> = {}) {
  const props = {
    slot: theSlot,
    zone: LONDON,
    onBooked: vi.fn(),
    onUnavailable: vi.fn(),
    onSlotsStale: vi.fn(),
    onChangeTime: vi.fn(),
    ...overrides,
  };
  render(
    <MemoryRouter>
      <BookingForm {...props} />
    </MemoryRouter>,
  );
  return props;
}

function fill(label: RegExp | string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function fillValid() {
  fill("Child's first name", 'Oliver');
  fill("Child's grade", '4');
  fill('Your name', 'Emma Clarke');
  fill(/Your email/, 'emma@example.com');
}

const booking = {
  id: '6f1c2b1e-0000-4000-8000-000000000001',
  startUtc: theSlot.startUtc,
  endUtc: theSlot.endUtc,
  parentTimezone: LONDON,
  parent: { name: 'Emma Clarke', email: 'emma@example.com' },
  child: { name: 'Oliver', grade: 4 },
  mentor: {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Ananya Iyer',
    timezone: 'Asia/Kolkata',
  },
  classLink: 'https://class.example.com/trial/6f1c2b1e-0000-4000-8000-000000000001',
  icsUrl: '/api/bookings/6f1c2b1e-0000-4000-8000-000000000001/calendar.ics',
};

describe('BookingForm', () => {
  it('shows the chosen time with date and zone', () => {
    renderForm();
    expect(screen.getByRole('heading', { level: 2 }).textContent).toContain(
      'Fri 13 Nov, 4:00 PM London time (GMT+0)',
    );
  });

  it('grade starts on a "Select grade" placeholder and is required (no silent default)', () => {
    renderForm();
    const grade = screen.getByLabelText("Child's grade") as HTMLSelectElement;
    expect(grade.value).toBe('');
    expect(grade.selectedOptions[0]!.textContent).toBe('Select grade');
    expect(grade.required).toBe(true);
  });

  it('sets autocomplete hints so browsers and password managers fill the right fields', () => {
    renderForm();
    const attr = (label: RegExp | string) =>
      screen.getByLabelText(label).getAttribute('autocomplete');
    expect(attr("Child's first name")).toBe('off');
    expect(attr("Child's grade")).toBe('off');
    expect(attr('Your name')).toBe('name');
    expect(attr(/Your email/)).toBe('email');
    expect(attr('Phone number')).toBe('tel-national');
    expect(attr('Country code')).toBe('tel-country-code');
    expect(screen.getByLabelText("Child's first name").getAttribute('data-1p-ignore')).toBe('');
  });

  it('defaults the country code from the zone and sends "07700 900123" as E.164', async () => {
    const create = vi.spyOn(api, 'createBooking').mockResolvedValue(booking);
    const props = renderForm();
    expect((screen.getByLabelText('Country code') as HTMLSelectElement).value).toBe('+44');
    fillValid();
    fill('Phone number', '07700 900123');
    fireEvent.click(screen.getByRole('button', { name: 'Book free class' }));

    await waitFor(() => expect(props.onBooked).toHaveBeenCalledWith(booking));
    expect(create).toHaveBeenCalledWith(
      {
        startUtc: '2026-11-13T16:00:00Z',
        parentTimezone: LONDON,
        childName: 'Oliver',
        childGrade: 4,
        parentName: 'Emma Clarke',
        parentEmail: 'emma@example.com',
        phone: '+447700900123',
      },
      expect.any(String),
    );
  });

  it('phone is optional: leaving it blank sends no phone', async () => {
    const create = vi.spyOn(api, 'createBooking').mockResolvedValue(booking);
    renderForm();
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Book free class' }));
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0]![0]).not.toHaveProperty('phone');
  });

  it('client-side: lists missing fields in a summary and marks each field', async () => {
    const create = vi.spyOn(api, 'createBooking');
    renderForm();
    fill('Phone number', 'call me');
    fireEvent.click(screen.getByRole('button', { name: 'Book free class' }));

    const summary = await screen.findByRole('alert');
    expect(summary.textContent).toContain('Please check the highlighted fields');
    expect(screen.getByLabelText("Child's first name").getAttribute('aria-invalid')).toBe('true');
    expect(description(screen.getByLabelText("Child's first name"))).toBe(
      "Please enter your child's first name.",
    );
    expect(description(screen.getByLabelText('Phone number'))).toBe(
      'Only used if we need to reach you about the class. Please check this number, or leave it blank.',
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('shows server 422 errors under the right fields', async () => {
    vi.spyOn(api, 'createBooking').mockRejectedValue(
      new ApiError('validation', 'Request is invalid', {
        parentEmail: 'Enter a valid email address',
      }),
    );
    renderForm();
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Book free class' }));
    expect(await screen.findByText('Enter a valid email address')).toBeTruthy();
    expect(screen.getByLabelText(/Your email/).getAttribute('aria-invalid')).toBe('true');
  });

  it('a 409 is handed to the page; a network error offers retry with the same key', async () => {
    const create = vi
      .spyOn(api, 'createBooking')
      .mockRejectedValueOnce(
        new ApiError(
          'network',
          "We couldn't reach our booking service. Check your connection and try again.",
        ),
      )
      .mockResolvedValueOnce(booking);
    const props = renderForm();
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Book free class' }));
    expect(await screen.findByText(/couldn't reach our booking service/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(props.onBooked).toHaveBeenCalled());
    expect(create.mock.calls[0]![1]).toBe(create.mock.calls[1]![1]);

    vi.spyOn(api, 'createBooking').mockRejectedValue(
      new ApiError('unavailable', 'taken', {}, 'FULLY_BOOKED'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Book free class' }));
    await waitFor(() => expect(props.onUnavailable).toHaveBeenCalled());
  });

  it('409 with alternatives: explains, keeps the form; tapping selects, a second button confirms', async () => {
    const alternatives = [
      '2026-11-13T17:00:00Z',
      '2026-11-13T15:00:00Z',
      '2026-11-14T16:00:00Z',
    ].map((startUtc) => ({
      startUtc,
      endUtc: startUtc.replace(/T(\d\d)/, (_, h) => `T${Number(h) + 1}`),
    }));
    const create = vi
      .spyOn(api, 'createBooking')
      .mockRejectedValueOnce(new ApiError('unavailable', 'taken', {}, 'FULLY_BOOKED', alternatives))
      .mockResolvedValueOnce({ ...booking, startUtc: '2026-11-13T17:00:00Z' });
    const props = renderForm();
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Book free class' }));

    const panel = await screen.findByRole('alert');
    expect(panel.textContent).toContain(
      'No mentor is free at Fri 13 Nov, 4:00 PM London time (GMT+0) anymore.',
    );
    expect(panel.textContent).toContain('Choose one, then confirm to book it with the details you');
    const options = within(panel).getAllByRole('button').slice(0, 3);
    expect(options.map((b) => b.textContent)).toEqual([
      'Fri 13 Nov, 5:00 PM London time (GMT+0)',
      'Fri 13 Nov, 3:00 PM London time (GMT+0)',
      'Sat 14 Nov, 4:00 PM London time (GMT+0)',
    ]);
    expect(props.onSlotsStale).toHaveBeenCalled();
    expect(props.onUnavailable).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Child's first name") as HTMLInputElement).value).toBe('Oliver');

    // Tapping only selects: no booking yet, because a wrong tap can't be undone later.
    fireEvent.click(options[0]!);
    expect(options[0]!.getAttribute('aria-pressed')).toBe('true');
    expect(create).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /^Book Fri 13 Nov, 5:00 PM/ })).toBeTruthy();

    // Changing your mind moves the selection and the confirm button.
    fireEvent.click(options[2]!);
    expect(options[0]!.getAttribute('aria-pressed')).toBe('false');
    expect(create).toHaveBeenCalledTimes(1);
    fireEvent.click(options[0]!);

    fireEvent.click(
      screen.getByRole('button', { name: 'Book Fri 13 Nov, 5:00 PM London time (GMT+0)' }),
    );
    await waitFor(() => expect(props.onBooked).toHaveBeenCalled());
    const [firstCall, secondCall] = create.mock.calls;
    expect(secondCall![0]).toEqual({ ...firstCall![0], startUtc: '2026-11-13T17:00:00Z' });
    expect(secondCall![1]).not.toBe(firstCall![1]); // a different request gets a fresh key
  });

  it('409 for a mentor cap reads like any taken time: about the time, not the day', async () => {
    vi.spyOn(api, 'createBooking').mockRejectedValue(
      new ApiError('unavailable', 'limit', {}, 'DAILY_LIMIT_REACHED', [
        { startUtc: '2026-11-14T16:00:00Z', endUtc: '2026-11-14T17:00:00Z' },
      ]),
    );
    renderForm();
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Book free class' }));
    const panel = await screen.findByRole('alert');
    expect(panel.textContent).toContain(
      'No mentor is free at Fri 13 Nov, 4:00 PM London time (GMT+0) anymore.',
    );
    expect(panel.textContent).not.toMatch(/limit/i);
  });

  it('duplicate trial: names the child and the existing time, and links to that booking', async () => {
    vi.spyOn(api, 'createBooking').mockRejectedValue(
      new ApiError('duplicate', 'Oliver already has a trial class booked.', {}, undefined, [], {
        id: '6f1c2b1e-0000-4000-8000-000000000009',
        startUtc: '2026-11-15T16:00:00Z',
        endUtc: '2026-11-15T17:00:00Z',
        childName: 'Oliver',
      }),
    );
    renderForm();
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Book free class' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(
      'Oliver already has a trial on Sun 15 Nov, 4:00 PM London time (GMT+0).',
    );
    expect(
      within(alert).getByRole('link', { name: 'View that booking' }).getAttribute('href'),
    ).toBe('/bookings/6f1c2b1e-0000-4000-8000-000000000009');
    expect(alert.textContent).toContain(
      "Booking for a different child? Change the child's name above.",
    );
  });

  it('editing the details after a failure gets a new Idempotency-Key', async () => {
    const create = vi
      .spyOn(api, 'createBooking')
      .mockRejectedValueOnce(
        new ApiError('busy', "We're busy right now. Please try again in a moment."),
      )
      .mockResolvedValueOnce(booking);
    renderForm();
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Book free class' }));
    await screen.findByText(/busy right now/);
    fill("Child's first name", 'Amelia');
    fireEvent.click(screen.getByRole('button', { name: 'Book free class' }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    expect(create.mock.calls[1]![1]).not.toBe(create.mock.calls[0]![1]);
  });

  it('still books on plain http (no crypto.randomUUID), e.g. a phone on http://192.168.x.x', async () => {
    const real = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) });
    expect(typeof globalThis.crypto.randomUUID).toBe('undefined');
    const create = vi.spyOn(api, 'createBooking').mockResolvedValue(booking);
    const props = renderForm();
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Book free class' }));
    await waitFor(() => expect(props.onBooked).toHaveBeenCalledWith(booking));
    expect(create.mock.calls[0]![1]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('an unexpected exception shows the generic error with a retry, never a silent failure', async () => {
    vi.spyOn(api, 'createBooking')
      .mockRejectedValueOnce(new TypeError('something unexpected'))
      .mockResolvedValueOnce(booking);
    const props = renderForm();
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Book free class' }));
    expect(
      await screen.findByText('Something went wrong on our side. Please try again.'),
    ).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Book free class' }) as HTMLButtonElement).disabled,
    ).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(props.onBooked).toHaveBeenCalled());
  });
});
