import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ApiError, api } from '../api/client.js';
import { BookPage } from './BookPage.js';
import { NY, slotsResponse } from '../testFixtures.js';

beforeEach(() => {
  localStorage.setItem('trialhour.timezone', NY);
  window.requestAnimationFrame = (cb) => {
    cb(0);
    return 0;
  };
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

function renderPage() {
  render(
    <MemoryRouter>
      <BookPage />
    </MemoryRouter>,
  );
}

function fillForm() {
  const set = (label: RegExp | string, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  set("Child's first name", 'Oliver');
  set("Child's grade", '4');
  set('Your name', 'Emma Clarke');
  set(/Your email/, 'emma@example.com');
}

describe('BookPage', () => {
  it('shows a loading state, then opens on the first day with open times', async () => {
    vi.spyOn(api, 'getSlots').mockResolvedValue(slotsResponse());
    renderPage();
    expect(screen.getByRole('status').textContent).toContain('Finding open times…');
    expect(await screen.findByText('Sun 15 Nov · New York time (GMT-5)')).toBeTruthy();
    expect(screen.getByText(/Times shown in/).textContent).toContain(
      'Times shown in New York time',
    );
  });

  it('shows an error with retry when slots fail to load', async () => {
    const get = vi
      .spyOn(api, 'getSlots')
      .mockRejectedValueOnce(
        new ApiError(
          'network',
          "We couldn't reach our booking service. Check your connection and try again.",
        ),
      )
      .mockResolvedValueOnce(slotsResponse());
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Sun 15 Nov · New York time (GMT-5)')).toBeTruthy();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('409 while booking: explains, clears the choice and refreshes the times', async () => {
    const get = vi.spyOn(api, 'getSlots').mockResolvedValue(slotsResponse());
    vi.spyOn(api, 'createBooking').mockRejectedValue(
      new ApiError('unavailable', 'No mentor is free at that time anymore.', {}, 'FULLY_BOOKED'),
    );
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '4:00 PM' }));
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'Book free class' }));

    expect(
      await screen.findByText(
        "No mentor is free at 4:00 PM on Sun 15 Nov anymore. We've refreshed the times; please pick another.",
      ),
    ).toBeTruthy();
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('button', { name: 'Book free class' })).toBeNull();
  });

  it('409 with alternatives: refreshes the times but keeps the form and its data on screen', async () => {
    const fresh = slotsResponse();
    fresh.days[3]!.slots[0] = {
      ...fresh.days[3]!.slots[0]!,
      available: false,
      reason: 'FULLY_BOOKED',
    };
    const get = vi
      .spyOn(api, 'getSlots')
      .mockResolvedValueOnce(slotsResponse())
      .mockResolvedValueOnce(fresh);
    vi.spyOn(api, 'createBooking').mockRejectedValue(
      new ApiError('unavailable', 'taken', {}, 'FULLY_BOOKED', [
        { startUtc: '2026-11-16T21:00:00Z', endUtc: '2026-11-16T22:00:00Z' },
      ]),
    );
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '4:00 PM' }));
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'Book free class' }));

    expect(
      await screen.findByRole('button', { name: 'Mon 16 Nov, 4:00 PM New York time (GMT-5)' }),
    ).toBeTruthy();
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    // The grid now shows the taken time as booked, and the form is still there with its data.
    await screen.findByRole('button', { name: /^4:00 PM.*Booked/ });
    expect((screen.getByLabelText("Child's first name") as HTMLInputElement).value).toBe('Oliver');
    expect(screen.getByRole('button', { name: 'Book free class' })).toBeTruthy();
  });

  it('asks for the zone when it cannot be detected or saved', () => {
    localStorage.clear();
    const get = vi.spyOn(api, 'getSlots');
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
      ...new Intl.DateTimeFormat().resolvedOptions(),
      timeZone: 'Etc/Unknown',
    });
    renderPage();
    expect(
      screen.getByText(
        "We couldn't detect your time zone. Please choose it so class times show correctly.",
      ),
    ).toBeTruthy();
    expect(screen.getByLabelText('Your time zone')).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });
});
