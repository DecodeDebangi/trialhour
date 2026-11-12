// Every parent-facing message in one place (SPEC §8). Times are always pre-formatted by
// @codeyoung/shared before they get here.

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

  reasonShort: {
    TOO_SOON: 'Too soon',
    FULLY_BOOKED: 'Booked',
    DAILY_LIMIT_REACHED: 'Mentors full',
  },
  reasonLong: {
    TOO_SOON: () =>
      'This time is too soon to book. We need at least 4 hours to get a mentor ready.',
    FULLY_BOOKED: (time: string) =>
      `All our mentors are teaching at ${time}. Please pick another time.`,
    DAILY_LIMIT_REACHED: (date: string) =>
      `Our mentors have reached their class limit for ${date}. Each mentor teaches at most 2 trial classes a day, so every child gets their full attention.`,
  },
  nextOpen: (when: string) => `Next open time: ${when}`,
  noOpenOnDay: (date: string) => `No open times on ${date}.`,
  noClassesOnDay: (date: string) => `No classes on ${date}.`,
  allFull:
    'All trial times for the next 2 weeks are taken. New times open every day, so please check back tomorrow.',
  slotJustTaken: (time: string) =>
    `Sorry, someone booked ${time} a moment ago. We've refreshed the times; please pick another.`,

  summaryLabel: 'Your free class',
  changeTime: 'Change time',
  continueWith: (time: string) => `Continue with ${time}`,

  formHeading: 'Your details',
  childName: "Child's first name",
  childGrade: "Child's grade",
  childGradePlaceholder: 'Choose a grade',
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

  networkError: "We couldn't reach our booking service. Check your connection and try again.",
  busyError: "We're busy right now. Please try again in a moment.",
  serverError: 'Something went wrong on our side. Please try again.',
  tryAgain: 'Try again',
} as const;
