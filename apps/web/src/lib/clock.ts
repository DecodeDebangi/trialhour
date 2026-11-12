// The web app's only reader of the system clock (CLAUDE.md: inject/centralise "now").
export function now(): Date {
  return new Date();
}
