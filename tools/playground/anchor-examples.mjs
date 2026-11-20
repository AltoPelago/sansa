const date = value => ({ temporal: { category: 'civilDate', value } });
const clock = value => ({ temporal: { category: 'civilClock', value } });
const derived = pieces => ({ temporal: { category: 'civilClockSet', pieces }, originClockForm: 'second', history: 'none-declared' });
const point = (day, time) => ({ kind: 'point', at: { day, time } });
const request = (anchor, value) => ({ operation: 'anchor', input: { anchor, clock: value, context: { profile: 'aeonic.operations.temporal.civil-anchor.v1' } } });
export const ANCHOR_EXAMPLES = [
  { id: 'anchor-leap', lane: 'anchor', title: 'Carry into leap day', detail: 'Day +1 at 01:30 anchored to February 28, 2024 becomes February 29 at 01:30.', request: request(date('2024-02-28'), derived([point('1', '01:30:00')])) },
  { id: 'anchor-borrow', lane: 'anchor', title: 'Borrow into the previous day', detail: 'Relative day −1 remains part of the exact translation.', request: request(date('2024-03-01'), derived([point('-1', '23:30:00')])) },
  { id: 'anchor-minute', lane: 'anchor', title: 'A whole minute', detail: 'An authored minute keeps its inclusive start and excluded end.', request: request(date('2024-02-28'), clock('23:59')) },
  { id: 'anchor-history', lane: 'anchor', title: 'Two independent histories', detail: 'Date clamping and clock approximation histories travel into the date-time bundle separately.', request: request({ temporal: { category: 'civilDateSet', ranges: [{ start: '2024-02-29', end: '2024-02-29' }] }, originGranularity: 'month', history: 'clamping-declared' }, { ...derived([point('0', '09:30:00.125')]), history: 'approximation-declared' }) },
  { id: 'anchor-gap', lane: 'anchor', title: 'Keep a missing midnight', detail: 'Two intervals exclude their shared midnight coordinate. Anchoring never fills the gap.', request: request(date('2024-02-28'), derived([{ kind: 'interval', start: { day: '0', time: '23:59:59' }, end: { day: '1', time: '00:00:00' }, includeStart: true, includeEnd: false }, { kind: 'interval', start: { day: '1', time: '00:00:00' }, end: { day: '1', time: '00:00:01' }, includeStart: false, includeEnd: true }])) },
  { id: 'anchor-long', lane: 'anchor', title: 'One interval across 100 days', detail: 'A continuous interval translates as one piece without enumerating its days or seconds.', request: request(date('2024-01-01'), derived([{ kind: 'interval', start: { day: '0', time: '00:00:00' }, end: { day: '100', time: '00:00:00' }, includeStart: true, includeEnd: false }])) },
  { id: 'anchor-upper', lane: 'anchor', title: 'The excluded domain boundary', detail: 'The last minute of year 9999 keeps its excluded end-of-domain marker.', request: request(date('9999-12-31'), clock('23:59')) },
  { id: 'anchor-month', lane: 'anchor', title: 'A month is not one anchor day', detail: 'A valid month fails single-day eligibility with a diagnostic and no value.', request: request(date('2024-02'), clock('09:30:00')) },
  { id: 'anchor-outside', lane: 'anchor', title: 'Carry outside the date domain', detail: 'An out-of-domain translated coordinate produces a diagnostic with no partial result.', request: request(date('9999-12-31'), derived([point('1', '00:00:00')])) },
];
