import type { DateTime } from 'luxon';
import {
  byMentorId,
  type AssignmentStrategy,
  type MentorState,
  type ShiftSnapshot,
} from './strategy.js';

const EPSILON = 1e-9;

/**
 * How much the rest of the shift relies on this mentor (SPEC §6):
 * Σ 1/k(s) over the mentor's other bookable slots s in the same shift, where k(s) is the
 * number of mentors eligible at s. A slot only this mentor can take adds 1; a slot five
 * mentors can take adds 0.2. Lower = cheaper to spend this mentor now.
 */
export function scarcityScore(
  mentor: MentorState,
  slotStart: DateTime,
  snapshot: ShiftSnapshot,
): number {
  const requested = slotStart.toMillis();
  let score = 0;
  for (const slot of snapshot.slots) {
    if (slot.startUtc.toMillis() === requested || slot.eligible.length === 0) continue;
    const covers = slot.eligible.some(
      (e) => e.mentorId === mentor.mentorId && e.shiftDate === mentor.shiftDate,
    );
    if (covers) score += 1 / slot.eligible.length;
  }
  return score;
}

/**
 * Spend the mentor whose remaining availability is least scarce, keeping mentors who cover
 * rare hours free. Ties: fewest bookings in the shift, then mentor id. Greedy, not optimal:
 * the optimum depends on future demand we don't know.
 */
export const capacityPreserving: AssignmentStrategy = {
  name: 'capacity-preserving',
  rank(slotStart, eligible, snapshot) {
    const scores = new Map(
      eligible.map((m) => [m.mentorId, scarcityScore(m, slotStart, snapshot)]),
    );
    return [...eligible].sort((a, b) => {
      const diff = scores.get(a.mentorId)! - scores.get(b.mentorId)!;
      if (Math.abs(diff) > EPSILON) return diff;
      return a.bookingsInShift - b.bookingsInShift || byMentorId(a, b);
    });
  },
};
