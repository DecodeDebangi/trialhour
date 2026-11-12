import { afterEach, describe, expect, it, vi } from 'vitest';
import { description } from '../../testUtils.js';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiError, api } from '../../api/client.js';
import { BookingForm } from './BookingForm.js';
import { slot } from '../../testFixtures.js';

afterEach(() => vi.restoreAllMocks());

const LONDON = 'Europe/London';
const theSlot = slot('2026-11-13T16:00:00Z');

function renderForm(overrides: Partial<Parameters<typeof BookingForm>[0]> = {}) {
  const props = {
    slot: theSlot,
    zone: LONDON,
    onBooked: vi.fn(),
    onUnavailable: vi.fn(),
    onChangeTime: vi.fn(),
    ...overrides,
  };
  render(<BookingForm {...props} />);
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
};

describe('BookingForm', () => {
  it('shows the chosen time with date and zone', () => {
    renderForm();
    expect(screen.getByRole('heading', { level: 2 }).textContent).toContain(
      'Fri 13 Nov, 4:00 PM London time (GMT+0)',
    );
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
});
