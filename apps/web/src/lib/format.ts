// Turning API values into text for people. The API keeps money in paisa and times in UTC;
// people in Dhaka read taka and local time.

const takaWhole = new Intl.NumberFormat('en-BD', {
  style: 'currency',
  currency: 'BDT',
  currencyDisplay: 'narrowSymbol',
  maximumFractionDigits: 0,
});
const takaExact = new Intl.NumberFormat('en-BD', {
  style: 'currency',
  currency: 'BDT',
  currencyDisplay: 'narrowSymbol',
  minimumFractionDigits: 2,
});

/** 7500 paisa → "৳75" (shows paisa only when there are some). Display only: all maths stays in paisa. */
export const taka = (paisa: number) =>
  (paisa % 100 === 0 ? takaWhole : takaExact).format(paisa / 100);

const time = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Dhaka',
  hour: '2-digit',
  minute: '2-digit',
});
const dateAndTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Dhaka',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

/** "2026-09-24T02:43:10Z" → "08:43" (Dhaka time). */
export const dhakaTime = (iso: string) => time.format(new Date(iso));

/** "2026-09-24T02:43:10Z" → "24 Sept, 08:43" (Dhaka time). */
export const dhakaDateTime = (iso: string) => dateAndTime.format(new Date(iso));
