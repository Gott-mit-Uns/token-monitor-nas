'use strict';

const TIME_ZONE = 'Asia/Shanghai';
const WORK_INTERVAL_MS = 10 * 60 * 1000;
const OTHER_INTERVAL_MS = 30 * 60 * 1000;
const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'
});

function validateCalendar(calendar) {
  if (!Number.isInteger(calendar?.year) || typeof calendar.source !== 'string'
    || !calendar.source.startsWith('https://') || !Array.isArray(calendar.holidays) || !Array.isArray(calendar.workingDays)) {
    throw new Error('Invalid Windows stream work calendar');
  }
  const seen = new Set();
  for (const date of [...calendar.holidays, ...calendar.workingDays]) {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)
      || !date.startsWith(`${calendar.year}-`) || seen.has(date)
      || !Number.isFinite(Date.parse(`${date}T00:00:00Z`))
      || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
      throw new Error('Invalid Windows stream work calendar date');
    }
    seen.add(date);
  }
  return { ...calendar, holidays: new Set(calendar.holidays), workingDays: new Set(calendar.workingDays) };
}

const CALENDARS = { 2026: validateCalendar(require('./calendars/2026.json')) };

function windowsStreamPolicy(nowMs = Date.now(), calendars = CALENDARS) {
  const parts = Object.fromEntries(dateFormatter.formatToParts(new Date(nowMs)).map(row => [row.type, row.value]));
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  const year = Number(parts.year);
  const hour = Number(parts.hour);
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  const calendar = calendars[year];
  const workday = calendar?.workingDays.has(day) || (!calendar?.holidays.has(day) && weekday >= 1 && weekday <= 5);
  const localMidnight = Date.parse(`${day}T00:00:00+08:00`);
  const nextBoundaryAtMs = localMidnight + (hour < 7 ? 7 : hour < 17 ? 17 : 24) * 60 * 60 * 1000;
  return {
    timezone: TIME_ZONE, calendarYear: year,
    calendarStatus: calendar ? 'official' : 'weekday_fallback',
    workday: Boolean(workday),
    intervalMs: workday && hour >= 7 && hour < 17 ? WORK_INTERVAL_MS : OTHER_INTERVAL_MS,
    nextBoundaryAtMs
  };
}

module.exports = { TIME_ZONE, WORK_INTERVAL_MS, OTHER_INTERVAL_MS, CALENDARS, validateCalendar, windowsStreamPolicy };
