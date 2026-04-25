// Generates suggested time slots for a service booking. There's no
// real-availability backend yet, so these are advisory — the user picks a
// preferred slot which is then included in the WhatsApp message to the clinic.

export type TimeSlot = {
  time: string; // "HH:MM" 24h format, used for the WhatsApp payload
  label: string; // "9:00 ص" / "1:00 م" for display
  disabled: boolean; // true if the slot is in the past relative to "now"
};

const DEFAULT_OPEN_HOUR = 9;
const DEFAULT_CLOSE_HOUR = 18;

const pad = (n: number) => (n < 10 ? `0${n}` : String(n));

const toArabicAmPm = (hour24: number, minute: number): string => {
  const period = hour24 < 12 ? 'ص' : 'م';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${pad(minute)} ${period}`;
};

// Parse strings like "9:00 - 17:00", "09:00–17:00", "9 AM - 5 PM" into a
// numeric [openHour, closeHour] pair. Returns null if we can't read it; the
// caller falls back to the default hours.
const parseWorkingHoursRange = (raw: string | undefined | null): [number, number] | null => {
  if (!raw) return null;
  const cleaned = raw
    .replace(/[‎‏]/g, '')
    .replace(/[–—]/g, '-')
    .toLowerCase();
  const match = cleaned.match(/(\d{1,2})(?:\s*[:.٫]\s*(\d{1,2}))?\s*(am|pm)?\s*-\s*(\d{1,2})(?:\s*[:.٫]\s*(\d{1,2}))?\s*(am|pm)?/);
  if (!match) return null;
  const normalize = (h: string, ap: string | undefined) => {
    let hour = parseInt(h, 10);
    if (!Number.isFinite(hour)) return null;
    if (ap === 'pm' && hour < 12) hour += 12;
    if (ap === 'am' && hour === 12) hour = 0;
    return Math.max(0, Math.min(23, hour));
  };
  const open = normalize(match[1], match[3]);
  const close = normalize(match[4], match[6]);
  if (open === null || close === null || close <= open) return null;
  return [open, close];
};

// One slot per hour from open → (close - 1). 30-minute increments would crowd
// the chip row on small screens; hourly is plenty for "preferred time."
export const generateTimeSlots = (
  workingHours: string | undefined,
  selectedDate: Date,
  now: Date = new Date(),
): TimeSlot[] => {
  const range = parseWorkingHoursRange(workingHours) ?? [DEFAULT_OPEN_HOUR, DEFAULT_CLOSE_HOUR];
  const [openHour, closeHour] = range;
  const slots: TimeSlot[] = [];

  const isToday =
    selectedDate.getFullYear() === now.getFullYear() &&
    selectedDate.getMonth() === now.getMonth() &&
    selectedDate.getDate() === now.getDate();

  for (let hour = openHour; hour < closeHour; hour += 1) {
    const time = `${pad(hour)}:00`;
    const slotMoment = new Date(selectedDate);
    slotMoment.setHours(hour, 0, 0, 0);
    const disabled = isToday && slotMoment.getTime() <= now.getTime();
    slots.push({ time, label: toArabicAmPm(hour, 0), disabled });
  }
  return slots;
};
