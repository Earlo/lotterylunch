type ZonedDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
};

const formatters = new Map<string, Intl.DateTimeFormat>();
const DAY = 24 * 60 * 60 * 1000;

export function zonedDateParts(date: Date, timezone: string): ZonedDateParts {
  let formatter = formatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(timezone, formatter);
  }
  const parts = formatter.formatToParts(date);
  const number = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: number('year'),
    month: number('month'),
    day: number('day'),
    hour: number('hour'),
    minute: number('minute'),
    second: number('second'),
    millisecond: date.getUTCMilliseconds(),
  };
}

export function zonedDay(date: Date, timezone: string) {
  const parts = zonedDateParts(date, timezone);
  return Date.UTC(parts.year, parts.month - 1, parts.day);
}

function wallTime(date: Date, timezone: string) {
  const parts = zonedDateParts(date, timezone);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, parts.millisecond);
}

// wallTime encodes local fields as UTC, rather than representing an actual UTC
// instant. Skip nonexistent DST times and choose the earlier of repeated times.
export function zonedWallTimeToInstant(wallTimeValue: number, timezone: string): number | null {
  const offsets = new Set(
    [-DAY, 0, DAY].map((difference) => {
      const sample = wallTimeValue + difference;
      return wallTime(new Date(sample), timezone) - sample;
    }),
  );
  const candidates = [...offsets]
    .map((offset) => wallTimeValue - offset)
    .filter((candidate) => wallTime(new Date(candidate), timezone) === wallTimeValue);
  return candidates.length ? Math.min(...candidates) : null;
}
