import type { DateTime } from 'luxon';
import { parseInstant } from '@codeyoung/shared';

export interface CalendarEventInput {
  id: string;
  startUtc: DateTime | string;
  endUtc: DateTime | string;
  childName: string;
  mentorName: string;
  classLink: string;
}

const icsDate = (dt: DateTime | string) => parseInstant(dt).toFormat("yyyyMMdd'T'HHmmss'Z'");

/** RFC 5545 TEXT escaping. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Folds a content line at 75 octets (RFC 5545 §3.1), never splitting a UTF-8 character. */
function fold(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    const limit = parts.length === 0 ? 75 : 74; // continuation lines start with a space
    if (bytes + size > limit) {
      parts.push(current);
      current = '';
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

/**
 * A single-event calendar file for the parent. Times are UTC (`…Z`), so every calendar app
 * shows them in the viewer's own zone and no VTIMEZONE block is needed.
 */
export function buildIcs(event: CalendarEventInput, stampUtc: DateTime): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Trialhour//Trial class booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.id}@trialhour.example.com`,
    `DTSTAMP:${icsDate(stampUtc)}`,
    `DTSTART:${icsDate(event.startUtc)}`,
    `DTEND:${icsDate(event.endUtc)}`,
    `SUMMARY:${escapeText(`Free coding class for ${event.childName}`)}`,
    `DESCRIPTION:${escapeText(
      `1:1 trial class with ${event.mentorName}.\nJoin here: ${event.classLink}\nJoin a few minutes early from a laptop or desktop computer with a camera and microphone.`,
    )}`,
    `URL:${event.classLink}`,
    `LOCATION:${escapeText('Online')}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Coding class in 15 minutes',
    'TRIGGER:-PT15M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
