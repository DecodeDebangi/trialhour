import { byMentorId, type AssignmentStrategy } from './strategy.js';

/** Fewest bookings in the shift first, then mentor id. */
export const fairLoad: AssignmentStrategy = {
  name: 'fair-load',
  rank: (_slotStart, eligible) =>
    [...eligible].sort((a, b) => a.bookingsInShift - b.bookingsInShift || byMentorId(a, b)),
};
