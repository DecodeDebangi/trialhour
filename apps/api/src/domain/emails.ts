import type { DateTime } from 'luxon';
import { formatInstant } from '@codeyoung/shared';

export interface BookingEmailInput {
  startUtc: DateTime | string;
  parent: { name: string; email: string; timezone: string };
  child: { name: string; grade: number };
  mentor: { name: string; email: string; timezone: string };
  classLink: string;
}

export interface EmailMessage {
  recipient: 'parent' | 'mentor';
  to: string;
  subject: string;
  body: string;
}

const firstName = (full: string) => full.trim().split(/\s+/)[0] ?? full;

/**
 * The two confirmation emails for one booking (SPEC R9). Each side gets the class time in
 * their own zone; the mentor also sees the parent's time so they know when it is for the family.
 */
export function composeBookingEmails(input: BookingEmailInput): [EmailMessage, EmailMessage] {
  const { parent, child, mentor, classLink } = input;
  const parentTime = formatInstant(input.startUtc, parent.timezone);
  const mentorTime = formatInstant(input.startUtc, mentor.timezone);

  const toParent: EmailMessage = {
    recipient: 'parent',
    to: parent.email,
    subject: `Booked: ${child.name}'s free coding class, ${parentTime}`,
    body: [
      `Hi ${firstName(parent.name)},`,
      '',
      `${child.name}'s free 1:1 coding class is booked.`,
      '',
      `When: ${parentTime}`,
      'Length: 60 minutes',
      `Mentor: ${mentor.name}`,
      `Class link: ${classLink}`,
      '',
      'Before the class:',
      '- Join a few minutes early from a laptop or desktop computer with a camera and microphone. Google Chrome works best.',
      `- No coding experience needed. ${child.name} just needs to bring their curiosity.`,
      '',
      'See you there,',
      'The Trialhour team',
    ].join('\n'),
  };

  const toMentor: EmailMessage = {
    recipient: 'mentor',
    to: mentor.email,
    subject: `New trial class: ${mentorTime}`,
    body: [
      `Hi ${firstName(mentor.name)},`,
      '',
      'You have a new trial class.',
      '',
      `When: ${mentorTime}`,
      `Parent's time: ${parentTime}`,
      'Length: 60 minutes',
      `Student: ${child.name}, Grade ${child.grade}`,
      `Parent: ${parent.name}`,
      `Class link: ${classLink}`,
      '',
      'Please join a few minutes early.',
      '',
      'Thanks,',
      'The Trialhour team',
    ].join('\n'),
  };

  return [toParent, toMentor];
}
