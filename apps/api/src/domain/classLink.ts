/** Dummy class link (brief §3). example.com is reserved, so it can't be mistaken for a real URL. */
export function classLinkFor(bookingId: string): string {
  return `https://class.example.com/trial/${bookingId}`;
}
