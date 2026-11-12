// Every parent-facing message in one place (SPEC §8). Times are always pre-formatted by
// @codeyoung/shared before they get here.

import type { UnavailableReason } from '@codeyoung/shared';

export const copy = {
  productName: 'Trialhour',
  heroTitle: 'Book a free 1:1 coding class for your child',
  heroFacts: ['60 minutes', 'Free', 'No payment needed'],

  zoneShownIn: 'Times shown in',
  zoneChange: 'Change',
  zonePickerLabel: 'Your time zone',
  zoneNotDetected:
    "We couldn't detect your time zone. Please choose it so class times show correctly.",
  zoneCommonGroup: 'Common',
  zoneAllGroup: 'All time zones',

  datesHeading: 'Pick a day',
  today: 'Today',
  dayOpen: (n: number) => `${n} open`,
  dayFull: 'Full',
  dayClosed: 'Closed',
  dayNoClasses: 'No classes',

  timesHeading: 'Pick a time',
  loadingTimes: 'Finding open times…',

  // Parent-facing reasons are always about *that time*, never internal rules such as a
  // mentor's daily cap: "no mentor is free then" is what matters to a parent, and another
  // time the same day may well be open. DAILY_LIMIT_REACHED therefore reads like FULLY_BOOKED.
  reasonShort: {
    TOO_SOON: 'Too soon',
    FULLY_BOOKED: 'Booked',
    DAILY_LIMIT_REACHED: 'Booked',
  },
  /** Explanation for a greyed-out time in the grid. */
  unavailableReason: (reason: UnavailableReason, time: string, date: string, notice: string) =>
    reason === 'TOO_SOON'
      ? `${time} on ${date} is too soon to book. We need at least ${notice} to get a mentor ready.`
      : `No mentor is free at ${time} on ${date}. Please pick another time.`,
  /** "4 hours", "1 hour", "90 minutes". */
  noticeDuration: (minutes: number) => {
    if (minutes % 60 !== 0) return `${minutes} minutes`;
    const hours = minutes / 60;
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  },
  nextOpen: (when: string) => `Next open time: ${when}`,
  noOpenOnDay: (date: string) => `No open times on ${date}.`,
  noClassesOnDay: (date: string) => `No classes on ${date}.`,
  allFull:
    'All trial times for the next 2 weeks are taken. New times open every day, so please check back tomorrow.',
  /** Heading of the 409 panel: the chosen time stopped being bookable while the form was open. */
  conflictTitle: (reason: UnavailableReason | undefined, time: string, date: string) =>
    reason === 'TOO_SOON'
      ? `${time} on ${date} is now too soon to book.`
      : `No mentor is free at ${time} on ${date} anymore.`,
  /** Page-level notice when a 409 comes back with no alternatives to offer. */
  slotJustTaken: (reason: UnavailableReason | undefined, time: string, date: string) =>
    `${copy.conflictTitle(reason, time, date)} We've refreshed the times; please pick another.`,
  conflictLead:
    "Here are the nearest open times. Choose one, then confirm to book it with the details you've entered.",
  bookThis: (when: string) => `Book ${when}`,
  pickAnother: 'Or pick another time',
  duplicateTrial: (child: string, when: string) => `${child} already has a trial on ${when}.`,
  viewThatBooking: 'View that booking',
  duplicateHint: "Booking for a different child? Change the child's name above.",

  summaryLabel: 'Your free class',
  changeTime: 'Change time',
  continueWith: (time: string) => `Continue with ${time}`,

  formHeading: 'Your details',
  childName: "Child's first name",
  childGrade: "Child's grade",
  childGradePlaceholder: 'Select grade',
  grade: (n: number) => `Grade ${n}`,
  parentName: 'Your name',
  parentEmail: 'Your email',
  parentEmailHint: "We'll send the class link here.",
  phone: 'Phone (optional)',
  phoneHint: 'Only used if we need to reach you about the class.',
  dialCode: 'Country code',
  phoneNumber: 'Phone number',
  submit: 'Book free class',
  submitting: 'Booking…',
  errorSummary: 'Please check the highlighted fields',
  fieldErrors: {
    childName: "Please enter your child's first name.",
    childGrade: 'Please choose a grade.',
    parentName: 'Please enter your name.',
    parentEmail: 'Please enter a valid email address, like name@example.com.',
    phone: 'Please check this number, or leave it blank.',
  },
  slotNoLongerOffered: "That time isn't available any more. Please pick another time.",

  bookedTitle: "You're all set!",
  bookedLead: (child: string) => `${child}'s free coding class is booked.`,
  whenLabel: 'When',
  durationNote: '60 minutes',
  mentorLabel: 'Mentor',
  linkLabel: 'Class link',
  copyLink: 'Copy link',
  copied: 'Link copied',
  copyFailed: 'Couldn’t copy automatically. The link is selected, so copy it from there.',
  openLink: 'Open class link',
  nextHeading: 'What happens next',
  nextSteps: [
    'Save this page or the class link above.',
    'Join a few minutes early from a laptop or desktop computer with a camera and microphone. Google Chrome works best.',
    'No coding experience needed. Your child just needs to bring their curiosity.',
  ],
  anotherChild: 'Book a class for another child',
  emailedTo: (email: string) => `We've emailed the details to ${email}.`,
  seeOutbox: 'See both emails in the demo outbox',
  calendarLabel: 'Calendar',
  addToCalendar: 'Add to calendar (.ics)',

  navOutbox: 'Outbox (demo)',
  outboxTitle: 'Outbox (demo)',
  outboxIntro:
    'No real emails are sent. Each booking sends two: one to the parent in their own time zone, and one to the mentor in India time.',
  outboxFiltered: 'Showing the emails for one booking.',
  outboxShowAll: 'Show all',
  outboxEmpty: 'No emails yet. Book a class and its two confirmation emails will appear here.',
  outboxLoading: 'Loading emails…',
  outboxBookingHeading: (child: string, mentor: string) => `${child}'s class with ${mentor}`,
  outboxSent: (when: string) => `Sent ${when}`,
  toParent: 'To the parent',
  toMentor: 'To the mentor',
  classTimeInEmail: 'Class time in this email',
  parentsTime: (when: string) => `Parent's time: ${when}`,
  emailTo: 'To',
  emailSubject: 'Subject',
  loadingBooking: 'Loading your booking…',
  bookingNotFound: "We couldn't find that booking. Please check the link, or book a new class.",
  bookNew: 'Book a free class',

  networkError: "We couldn't reach our booking service. Check your connection and try again.",
  busyError: "We're busy right now. Please try again in a moment.",
  serverError: 'Something went wrong on our side. Please try again.',
  tryAgain: 'Try again',
} as const;
