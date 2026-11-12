import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { BookingResponse } from '@codeyoung/shared';
import { ApiError, api } from '../api/client.js';
import { ConfirmationPage } from './ConfirmationPage.js';

afterEach(() => vi.restoreAllMocks());

const booking: BookingResponse = {
  id: '6f1c2b1e-0000-4000-8000-000000000001',
  startUtc: '2026-11-13T21:00:00Z',
  endUtc: '2026-11-13T22:00:00Z',
  parentTimezone: 'America/New_York',
  parent: { name: 'Ashley Johnson', email: 'ashley@example.com' },
  child: { name: 'Mason', grade: 5 },
  mentor: {
    id: '00000000-0000-4000-8000-000000000004',
    name: 'Arjun Sharma',
    timezone: 'Asia/Kolkata',
  },
  classLink: 'https://class.example.com/trial/6f1c2b1e-0000-4000-8000-000000000001',
};

function HomeProbe() {
  const state = useLocation().state as { prefill?: unknown } | null;
  return <p>home {JSON.stringify(state?.prefill)}</p>;
}

function renderAt(state?: unknown) {
  render(
    <MemoryRouter initialEntries={[{ pathname: `/bookings/${booking.id}`, state }]}>
      <Routes>
        <Route path="/bookings/:id" element={<ConfirmationPage />} />
        <Route path="/" element={<HomeProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ConfirmationPage', () => {
  it("shows the parent's time, the mentor's name only, and the class link", async () => {
    vi.spyOn(api, 'getBooking').mockResolvedValue(booking);
    renderAt();
    expect(await screen.findByRole('heading', { name: "You're all set!" })).toBeTruthy();
    expect(screen.getByText("Mason's free coding class is booked.")).toBeTruthy();
    expect(screen.getByText('Fri 13 Nov, 4:00 PM')).toBeTruthy();
    expect(screen.getByText('New York time (GMT-5) · 60 minutes')).toBeTruthy();
    expect(screen.getByText('Arjun Sharma')).toBeTruthy();
    expect((screen.getByLabelText('Class link') as HTMLInputElement).value).toBe(booking.classLink);
    expect(screen.getByRole('link', { name: 'Open class link' }).getAttribute('href')).toBe(
      booking.classLink,
    );
    // The mentor's own time is deliberately not shown to parents.
    expect(document.body.textContent).not.toMatch(/India time|GMT\+5:30|2:30 AM/);
  });

  it('gives laptop/desktop guidance, not tablets', async () => {
    vi.spyOn(api, 'getBooking').mockResolvedValue(booking);
    renderAt();
    const steps = await screen.findByRole('list');
    expect(steps.textContent).toContain(
      'Join a few minutes early from a laptop or desktop computer with a camera and microphone. Google Chrome works best.',
    );
    expect(steps.textContent).not.toMatch(/tablet/i);
  });

  it('uses the booking handed over by the form without fetching', () => {
    const get = vi.spyOn(api, 'getBooking');
    renderAt({ booking });
    expect(screen.getByText('Arjun Sharma')).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });

  it('copies the link and announces it', async () => {
    vi.spyOn(api, 'getBooking').mockResolvedValue(booking);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderAt();
    fireEvent.click(await screen.findByRole('button', { name: 'Copy link' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Link copied'));
    expect(writeText).toHaveBeenCalledWith(booking.classLink);
  });

  it('falls back to selecting the link when the clipboard is refused', async () => {
    vi.spyOn(api, 'getBooking').mockResolvedValue(booking);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    });
    renderAt();
    fireEvent.click(await screen.findByRole('button', { name: 'Copy link' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/selected/));
    expect(document.activeElement).toBe(screen.getByLabelText('Class link'));
  });

  it('"Book a class for another child" keeps the parent’s name and email', async () => {
    vi.spyOn(api, 'getBooking').mockResolvedValue(booking);
    renderAt();
    fireEvent.click(await screen.findByRole('link', { name: 'Book a class for another child' }));
    expect(
      screen.getByText('home {"parentName":"Ashley Johnson","parentEmail":"ashley@example.com"}'),
    ).toBeTruthy();
  });

  it('unknown booking → friendly not-found with a way back', async () => {
    vi.spyOn(api, 'getBooking').mockRejectedValue(new ApiError('not-found', 'Booking not found'));
    renderAt();
    expect(
      await screen.findByText(
        "We couldn't find that booking. Please check the link, or book a new class.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Book a free class' })).toBeTruthy();
  });

  it('network error → retry', async () => {
    const get = vi
      .spyOn(api, 'getBooking')
      .mockRejectedValueOnce(
        new ApiError(
          'network',
          "We couldn't reach our booking service. Check your connection and try again.",
        ),
      )
      .mockResolvedValueOnce(booking);
    renderAt();
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Arjun Sharma')).toBeTruthy();
    expect(get).toHaveBeenCalledTimes(2);
  });
});
