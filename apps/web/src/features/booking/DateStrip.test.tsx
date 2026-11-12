import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DateStrip } from './DateStrip.js';
import { NY, slotsResponse } from '../../testFixtures.js';

describe('DateStrip', () => {
  const days = slotsResponse().days;

  it('says in words which days are open, full, closed or have no classes', () => {
    render(
      <DateStrip
        days={days}
        zone={NY}
        today="2026-11-12"
        selectedDate="2026-11-15"
        onSelect={() => {}}
      />,
    );
    const chips = screen.getAllByRole('button');
    expect(chips.map((c) => c.textContent)).toEqual([
      'Today12 Nov✕Closed',
      'Fri13 Nov✕Full',
      'Sat14 Nov✕No classes',
      'Sun15 Nov1 open',
    ]);
  });

  it('marks the selected day with aria-current and reports taps', () => {
    const onSelect = vi.fn();
    render(
      <DateStrip
        days={days}
        zone={NY}
        today="2026-11-12"
        selectedDate="2026-11-15"
        onSelect={onSelect}
      />,
    );
    expect(screen.getByRole('button', { name: /Sun/ }).getAttribute('aria-current')).toBe('date');
    expect(screen.getByRole('button', { name: /Fri/ }).getAttribute('aria-current')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Fri/ }));
    expect(onSelect).toHaveBeenCalledWith('2026-11-13');
  });

  it('counts only what the grid shows: a night-only day says "No daytime times"', () => {
    const nightOnly = [
      {
        date: '2026-11-16',
        slots: [
          { startUtc: '2026-11-16T07:00:00Z', endUtc: '2026-11-16T08:00:00Z', available: true },
          { startUtc: '2026-11-16T08:00:00Z', endUtc: '2026-11-16T09:00:00Z', available: true },
        ],
      },
    ];
    const daytimeOnly = () => false;
    render(
      <DateStrip
        days={nightOnly}
        zone={NY}
        today="2026-11-12"
        selectedDate={null}
        onSelect={() => {}}
        visible={daytimeOnly}
      />,
    );
    expect(screen.getByRole('button').textContent).toBe('Mon16 Nov✕No daytime times');
  });
});
