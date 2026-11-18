const b = value => ({ number: { category: 'finiteNumber', value } });
const clock = value => ({ temporal: { category: 'civilClock', value } });
const clockSet = (day, time) => ({ temporal: { category: 'civilClockSet', pieces: [{ kind: 'point', at: { day, time } }] }, originClockForm: 'second', history: 'none-declared' });
const clockRequest = (operation, value, other, policy) => ({ operation, input: { context: { profile: 'aeonic.operations.temporal.civil-clock.v1' },
  ...(['equal', 'compare', 'relate'].includes(operation) ? { left: value, right: other } : { value, ...(operation === 'shiftClock' ? { amount: other } : {}) }), ...(policy ? { policy } : {}) } });
export const CLOCK_EXAMPLES = [
  { id: 'clock-midnight', lane: 'clock', title: 'Keep the midnight carry', detail: '23:30 plus two civil hours gives day +1 at 01:30. Reuse the exact bundle to reverse the shift.', request: clockRequest('shiftClock', clock('23:30:00'), b('7200')) },
  { id: 'clock-borrow', lane: 'clock', title: 'Before reference midnight', detail: 'Subtract half a second from midnight: day −1 at 23:59:59.5. Negative coordinates use mathematical floor.', request: clockRequest('shiftClock', clock('00:00:00'), b('-0.5')) },
  { id: 'clock-minute', lane: 'clock', title: 'A minute crossing midnight', detail: 'A half-second shift keeps an exact interval crossing into day +1, preserving its excluded end.', request: clockRequest('shiftClock', clock('23:59'), b('0.5')) },
  { id: 'clock-step', lane: 'clock', title: 'Step one complete hour', detail: 'Stepping the 23: hour gives the 00: hour on day +1. It is not wrapped to day zero.', request: clockRequest('step', clock('23:'), undefined, { clockForm: 'hour', count: '1' }) },
  { id: 'clock-last-hour', lane: 'clock', title: 'Materialize the last hour', detail: 'The last hour begins on day 0 and ends at excluded day +1 midnight. It materializes exactly.', request: clockRequest('materialize', clock('23:'), undefined, { clockForm: 'hour' }) },
  { id: 'clock-output-carry', lane: 'clock', title: 'Materialization keeps day meaning', detail: 'A day +1 point cannot become a bare day-zero clock. The result is a diagnostic with no value.', request: clockRequest('materialize', clockSet('1', '01:30:00'), undefined, { clockForm: 'second' }) },
  { id: 'clock-day-equality', lane: 'clock', title: 'Same face, different day', detail: '01:30 on day +1 is not equal to authored 01:30 on day 0.', request: clockRequest('equal', clockSet('1', '01:30:00'), clock('01:30:00')) },
  { id: 'clock-containment', lane: 'clock', title: 'Minute contains its first point', detail: 'Relate an exact minute to its included starting second. Relations return symbols.', request: clockRequest('relate', clock('09:30'), clock('09:30:00')) },
  { id: 'clock-history', lane: 'clock', title: 'Keep approximation history', detail: 'The shift is exact for the supplied amount. Its declared earlier approximation remains attached to the result.', request: clockRequest('shiftClock', clock('23:59:59.9'), { number: { category: 'exactNumber', coefficient: '2', exponent: '-1' }, history: 'approximation-declared' }) },
];
