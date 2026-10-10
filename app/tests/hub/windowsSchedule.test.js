'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { windowsStreamPolicy, validateCalendar, CALENDARS } = require('../../src/hub/windowsSchedule');
const at = text => Date.parse(`${text}+08:00`);

for (const [date, minutes, workday] of [
  ['2026-10-09T06:59:59', 30, true], ['2026-10-09T07:00:00', 10, true],
  ['2026-10-09T16:59:59', 10, true], ['2026-10-09T17:00:00', 30, true],
  ['2026-10-10T09:00:00', 10, true], ['2026-10-11T09:00:00', 30, false],
  ['2026-10-01T09:00:00', 30, false], ['2026-01-04T09:00:00', 10, true],
  ['2026-02-14T09:00:00', 10, true], ['2026-02-23T09:00:00', 30, false],
  ['2026-02-28T09:00:00', 10, true], ['2026-04-06T09:00:00', 30, false],
  ['2026-05-09T09:00:00', 10, true], ['2026-06-19T09:00:00', 30, false],
  ['2026-09-20T09:00:00', 10, true], ['2026-09-25T09:00:00', 30, false]
]) test(`Shanghai calendar selects ${minutes} minutes at ${date}`, () => {
  const policy = windowsStreamPolicy(at(date));
  assert.equal(policy.intervalMs, minutes * 60000);
  assert.equal(policy.workday, workday);
  assert.equal(policy.calendarStatus, 'official');
});

test('unknown years fall back to Shanghai weekdays and report the missing calendar', () => {
  const weekday = windowsStreamPolicy(at('2027-01-04T08:00:00'));
  const weekend = windowsStreamPolicy(at('2027-01-03T08:00:00'));
  assert.equal(weekday.intervalMs, 600000);
  assert.equal(weekend.intervalMs, 1800000);
  assert.equal(weekday.calendarStatus, 'weekday_fallback');
  assert.equal(weekday.calendarYear, 2027);
});

test('boundaries are 07:00, 17:00 and midnight in Shanghai, independent of host TZ', () => {
  for (const [from, next] of [
    ['2026-10-09T06:59:59', '2026-10-09T07:00:00'],
    ['2026-10-09T16:59:59', '2026-10-09T17:00:00'],
    ['2026-10-09T23:59:59', '2026-10-10T00:00:00']
  ]) assert.equal(windowsStreamPolicy(at(from)).nextBoundaryAtMs, at(next));
});

test('calendar rejects invalid dates, repeated days and contradictory day overrides', () => {
  const valid = { year: 2026, source: 'https://www.gov.cn/example', holidays: [], workingDays: [] };
  for (const calendar of [
    { ...valid, holidays: ['2026-02-30'] }, { ...valid, holidays: ['2027-01-01'] },
    { ...valid, holidays: ['2026-01-01', '2026-01-01'] },
    { ...valid, holidays: ['2026-01-01'], workingDays: ['2026-01-01'] },
    { ...valid, workingDays: null }
  ]) assert.throws(() => validateCalendar(calendar), /Invalid Windows/);
  assert.equal(CALENDARS[2026].holidays.size, 33);
  assert.equal(CALENDARS[2026].workingDays.size, 6);
});
