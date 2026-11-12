import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { OutboxEntry } from '@codeyoung/shared';
import { ApiError, api } from '../api/client.js';
import { OutboxPage } from './OutboxPage.js';

afterEach(() => vi.restoreAllMocks());

const entry: OutboxEntry = {
  bookingId: '6f1c2b1e-0000-4000-8000-000000000001',
  startUtc: '2027-03-14T21:00:00Z',
  childName: 'Mason',
  mentorName: 'Arjun Sharma',
  parentTimezone: 'America/New_York',
  mentorTimezone: 'Asia/Kolkata',
  sentAt: '2027-03-10T09:15:00Z',
  parent: {
    to: 'ashley@example.com',
    subject: "Booked: Mason's free coding class, Sun 14 Mar, 5:00 PM New York time (GMT-4)",
    body: 'Hi Ashley,\n\nWhen: Sun 14 Mar, 5:00 PM New York time (GMT-4)',
  },
  mentor: {
    to: 'arjun@mentors.example.com',
    subject: 'New trial class: Mon 15 Mar, 2:30 AM India time (GMT+5:30)',
    body: "Hi Arjun,\n\nWhen: Mon 15 Mar, 2:30 AM India time (GMT+5:30)\nParent's time: Sun 14 Mar, 5:00 PM New York time (GMT-4)",
  },
};

function renderAt(path = '/outbox') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <OutboxPage />
    </MemoryRouter>,
  );
}

describe('OutboxPage', () => {
  it('shows each booking’s two emails side by side, each in its reader’s own time', async () => {
    vi.spyOn(api, 'getOutbox').mockResolvedValue({ entries: [entry] });
    renderAt();
    expect(
      await screen.findByRole('heading', { name: "Mason's class with Arjun Sharma" }),
    ).toBeTruthy();
    expect(screen.getByText('Sent Wed 10 Mar, 9:15 AM UTC')).toBeTruthy();

    const parent = screen.getByRole('article', { name: 'To the parent' });
    expect(within(parent).getByText('Sun 14 Mar, 5:00 PM New York time (GMT-4)')).toBeTruthy();
    expect(within(parent).getByText('ashley@example.com')).toBeTruthy();
    expect(parent.textContent).not.toMatch(/India time/);

    const mentor = screen.getByRole('article', { name: 'To the mentor' });
    expect(within(mentor).getByText('Mon 15 Mar, 2:30 AM India time (GMT+5:30)')).toBeTruthy();
    expect(
      within(mentor).getByText("Parent's time: Sun 14 Mar, 5:00 PM New York time (GMT-4)"),
    ).toBeTruthy();
    expect(within(mentor).getByText('arjun@mentors.example.com')).toBeTruthy();
  });

  it('filters to one booking from the confirmation link, with a way to show all', async () => {
    const get = vi.spyOn(api, 'getOutbox').mockResolvedValue({ entries: [entry] });
    renderAt(`/outbox?booking=${entry.bookingId}`);
    expect(await screen.findByText('Showing the emails for one booking.')).toBeTruthy();
    expect(get).toHaveBeenCalledWith(entry.bookingId);
    expect(screen.getByRole('link', { name: 'Show all' }).getAttribute('href')).toBe('/outbox');
  });

  it('has loading, empty and error states', async () => {
    vi.spyOn(api, 'getOutbox')
      .mockRejectedValueOnce(
        new ApiError(
          'network',
          "We couldn't reach our booking service. Check your connection and try again.",
        ),
      )
      .mockResolvedValueOnce({ entries: [] });
    renderAt();
    expect(screen.getByRole('status').textContent).toBe('Loading emails…');
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByText(
        'No emails yet. Book a class and its two confirmation emails will appear here.',
      ),
    ).toBeTruthy();
  });
});
