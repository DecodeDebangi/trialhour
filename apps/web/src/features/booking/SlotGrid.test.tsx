import { describe, expect, it, vi } from 'vitest';
import { description } from '../../testUtils.js';
import { fireEvent, render, screen } from '@testing-library/react';
import { SlotGrid } from './SlotGrid.js';
import { NY, slot, slotsResponse } from '../../testFixtures.js';
import { nextOpenSlot } from '../../lib/days.js';

const days = slotsResponse().days;

function renderDay(date: string, overrides: Partial<Parameters<typeof SlotGrid>[0]> = {}) {
  const day = days.find((d) => d.date === date)!;
  const props = {
    date,
    slots: day.slots,
    zone: NY,
    selectedStart: null,
    onSelect: vi.fn(),
    nextOpenAfter: (start: string) => nextOpenSlot(days, start),
    onJumpTo: vi.fn(),
    ...overrides,
  };
  render(<SlotGrid {...props} />);
  return props;
}

describe('SlotGrid', () => {
  it('shows the date and zone once in the header, times only on buttons', () => {
    renderDay('2026-11-15');
    expect(screen.getByText('Sun 15 Nov · New York time (GMT-5)')).toBeTruthy();
    expect(screen.getByRole('button', { name: '4:00 PM' })).toBeTruthy();
  });

  it('tapping an unavailable time opens its reason inline and never selects it', () => {
    const props = renderDay('2026-11-13');
    const booked = screen.getByRole('button', { name: /^3:00 PM/ });
    expect(booked.getAttribute('aria-disabled')).toBe('true');
    expect(booked.getAttribute('aria-expanded')).toBe('false');
    expect(booked.textContent).toContain('Booked'); // short reason always visible

    fireEvent.click(booked);
    expect(booked.getAttribute('aria-expanded')).toBe('true');
    const panel = screen.getByRole('region', { name: /3:00 PM: Booked/ });
    expect(panel.textContent).toContain(
      'All our mentors are teaching at 3:00 PM. Please pick another time.',
    );
    expect(props.onSelect).not.toHaveBeenCalled();

    fireEvent.click(booked);
    expect(screen.queryByRole('region', { name: /3:00 PM: Booked/ })).toBeNull();
  });

  it('screen readers get the full reason without tapping (aria-describedby)', () => {
    renderDay('2026-11-13');
    expect(description(screen.getByRole('button', { name: /^4:00 PM/ }))).toBe(
      'Our mentors have reached their class limit for Fri 13 Nov. Each mentor teaches at most 2 trial classes a day, so every child gets their full attention.',
    );
  });

  it('a full day offers the next open time, and jumping reports that slot', () => {
    const props = renderDay('2026-11-13');
    expect(screen.getByText('No open times on Fri 13 Nov.')).toBeTruthy();
    const next = screen.getByRole('button', {
      name: 'Next open time: Sun 15 Nov, 4:00 PM New York time (GMT-5)',
    });
    fireEvent.click(next);
    expect(props.onJumpTo).toHaveBeenCalledWith(
      expect.objectContaining({ startUtc: '2026-11-15T21:00:00Z' }),
    );
  });

  it('a day with no classes says so and still offers the next open time', () => {
    renderDay('2026-11-14');
    expect(screen.getByText('No classes on Sat 14 Nov.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Next open time: Sun 15 Nov/ })).toBeTruthy();
  });

  it('selecting an open time reports it and marks it pressed', () => {
    const props = renderDay('2026-11-15', { selectedStart: '2026-11-15T21:00:00Z' });
    const open = screen.getByRole('button', { name: '4:00 PM' });
    expect(open.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(open);
    expect(props.onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ startUtc: '2026-11-15T21:00:00Z' }),
    );
  });

  it('on a clock-change day every time shows its own offset', () => {
    // Sun 7 Nov 2027, New York falls back: 1:30 AM happens twice.
    render(
      <SlotGrid
        date="2027-11-07"
        slots={[
          slot('2027-11-07T05:00:00Z'),
          slot('2027-11-07T06:00:00Z'),
          slot('2027-11-07T07:00:00Z'),
        ]}
        zone={NY}
        selectedStart={null}
        onSelect={() => {}}
        nextOpenAfter={() => null}
        onJumpTo={() => {}}
      />,
    );
    expect(screen.getByText('Sun 7 Nov · New York time')).toBeTruthy();
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      '1:00 AMGMT-4',
      '1:00 AMGMT-5',
      '2:00 AMGMT-5',
    ]);
  });
});
