import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAeonicCivilDateTime as evaluate, evaluateAeonicCivilDateTimeText, AEONIC_TEMPORAL_CIVIL_DATETIME_PROFILE as profile } from '../src/index.js';
import { parseRationalArithmeticEnvelope } from '../src/aeonic-rational-json.js';
const civil = value => ({ temporal: { category: 'civilDateTime', value } });
const history = { clamping: 'none-declared', approximation: 'none-declared' };
const derived = pieces => ({ temporal: { category: 'civilDateTimeSet', pieces }, originDateGranularity: 'undeclared', originClockForm: 'undeclared', history });
const request = (operation, value, policy, other) => ({ operation, input: { context: { profile },
  ...(['equal', 'compare', 'relate'].includes(operation) ? { left: value, right: other } : { value, ...(operation === 'shiftClock' ? { amount: other } : {}) }), ...(policy ? { policy } : {}) } });
const shift = (v, unit = 'month', count = '1', options) => evaluate(request('shift', v, { unit, count }), options);
const clock = (v, value, options) => evaluate(request('shiftClock', v, null, { number: { category: 'finiteNumber', value } }), options);
const at = n => `2024-03-01T00:00:0${n}`;
const interval = (a, b, includeStart, includeEnd) => ({ kind: 'interval', start: at(a), end: at(b), includeStart, includeEnd });
const point = n => ({ kind: 'point', at: at(n) });

test('date-time chaining preserves exact windows, direct clamps and all metadata', () => {
  const input = civil('2024-02T09:30'), saved = structuredClone(input), first = shift(input);
  assert.equal(first.value.temporal.pieces.length, 29);
  assert.equal(first.value.temporal.pieces.at(-1).end, '2024-03-29T09:31:00');
  assert.equal(evaluate(request('materialize', first.value, { dateGranularity: 'month', clockForm: 'minute' })).reason, 'unrepresentable_result');
  const step = evaluate(request('step', input, { dateGranularity: 'month', clockForm: 'minute', count: '1' }));
  assert.equal(step.value.temporal.pieces.length, 31);
  assert.equal(evaluate(request('materialize', step.value, { dateGranularity: 'month', clockForm: 'minute' })).value.temporal.value, '2024-03T09:30');
  const clamped = shift(civil('2023-01-31T09:30:00'));
  assert.equal(clamped.metadata.clamping, 'applied');
  const roundedAmount = { number: { category: 'exactNumber', coefficient: '5', exponent: '-1' }, history: 'approximation-declared' };
  const moved = evaluate(request('shiftClock', clamped.value, null, roundedAmount));
  assert.deepEqual(moved.value.history, { clamping: 'clamping-declared', approximation: 'approximation-declared' });
  assert.equal(moved.value.temporal.pieces[0].at, '2023-02-28T09:30:00.5');
  const zero = clock(moved.value, '0');
  assert.deepEqual(zero.value.history, moved.value.history);
  assert.equal(zero.value.originClockForm, 'second'); assert.equal(zero.metadata.clamping, 'not-applied');
  assert.equal(shift(civil('2023-01-31T09:30:00'), 'month', '2').value.temporal.pieces[0].at, '2023-03-31T09:30:00');
  assert.equal(shift(clamped.value).value.temporal.pieces[0].at, '2023-03-28T09:30:00');
  assert.deepEqual(input, saved);
});

test('all endpoint combinations satisfy independent sampled-set relations', () => {
  const cases = [];
  for (const [a,b] of [[0,1],[1,2],[0,2],[2,3]]) for (const il of [false,true]) for (const ih of [false,true]) {
    const members = new Set(Array.from({ length: 7 }, (_, i) => i).filter(i => (i > a*2 || il && i === a*2) && (i < b*2 || ih && i === b*2)));
    cases.push({ value: derived([interval(a,b,il,ih)]), members, min:a*2,max:b*2,il,ih });
  }
  for (let n=0;n<4;n++) cases.push({ value:derived([point(n)]),members:new Set([n*2]),min:n*2,max:n*2,il:true,ih:true });
  for (const a of cases) for (const b of cases) {
    const subset = (x,y) => [...x].every(n => y.has(n));
    const equal = subset(a.members,b.members) && subset(b.members,a.members);
    const relation = equal ? 'equal' : subset(a.members,b.members) ? 'containedBy' : subset(b.members,a.members) ? 'contains' : [...a.members].some(n => b.members.has(n)) ? 'overlaps' : 'disjoint';
    const before = (x,y) => x.max < y.min || x.max === y.min && !(x.ih && y.il);
    assert.equal(evaluate(request('relate', a.value, null, b.value)).value.value, relation);
    assert.equal(evaluate(request('compare', a.value, null, b.value)).value.value, equal ? 'equal' : before(a,b) ? 'before' : before(b,a) ? 'after' : 'indeterminate');
  }
});

test('clamping reorders windows without filling gaps and merges covered boundaries only', () => {
  const v = derived([{kind:'interval', start:'2023-01-30T23:00:00',end:'2023-01-31T01:00:00',includeStart:true,includeEnd:false}]);
  const spans = shift(v).value.temporal.pieces;
  assert.deepEqual(spans.map(p=>[p.start,p.end]), [['2023-02-28T00:00:00','2023-02-28T01:00:00'],['2023-02-28T23:00:00','2023-03-01T00:00:00']]);
  assert.equal(shift(v).metadata.clamping,'applied');
  const gap = derived([interval(0,1,true,false),interval(1,2,false,true)]);
  assert.equal(clock(gap, '0.1').value.temporal.pieces.length,2);
  for(const pieces of [[interval(0,1,true,false),interval(1,2,true,false)],[interval(0,1,true,true),point(1)],[point(2),point(1)]]) {
    const result=clock(derived(pieces),'0'); assert.equal(result.reason,'invalid_operand'); assert.equal('value' in result,false);
  }
});

test('exact fractions, negative carry, upper boundary and explicit profile stay fail closed', () => {
  assert.equal(clock(civil('2024-03-01T00:00:00.1'),'-0.2').value.temporal.pieces[0].at,'2024-02-29T23:59:59.9');
  assert.equal(clock(civil('2024-03-01T00:00:00'),'1e-100').value.temporal.pieces[0].at,'2024-03-01T00:00:00.'+'0'.repeat(99)+'1');
  const end=clock(civil('9999-12-31T23:59'),'0');
  assert.deepEqual(end.value.temporal.pieces[0].end,{boundary:'endOfDomain'});
  assert.equal(clock(civil('9999-12-31T23:59:59.9'),'0.1').reason,'unrepresentable_result');
  assert.equal(clock(civil('0001-01-01T00:00:00'),'-1e-1000000').reason,'unrepresentable_result');
  assert.equal(clock(civil('2024-03-01T00:00:00'),'1e-1000000').reason,'resource_limit');
  for (const text of ['2024-03-01T00:00:60','2024-03-01T00:00Z','2024-03-01T00:00+00:00']) assert.equal(clock(civil(text),'0').reason,'invalid_operand');
  const r=request('shiftClock',civil('2024-03-01T00:00'),null,{number:{category:'finiteNumber',value:'0'}});delete r.input.context;
  assert.equal(evaluate(r).context.path,'/input/policy/profile');
});

test('portable work recipes guard matching, amount precision, output and successful envelope bytes', () => {
  const r=request('step',civil('2024-02T09:30'),{dateGranularity:'month',clockForm:'minute',count:'1'});
  const limited = limits => evaluate(r,{resourceLimits:limits});
  assert.equal(limited({maxWork:88}).context.stage,6);assert.equal(limited({maxWork:89}).outcome,'value');
  assert.equal(limited({maxIntermediatePieces:59}).context.stage,6);assert.equal(limited({maxIntermediatePieces:60}).outcome,'value');
  assert.equal(limited({maxOutputPieces:30}).context.stage,7);
  const partial=request('step',civil('2024-02-29T09:30'),{dateGranularity:'month',clockForm:'minute',count:'1'});
  assert.equal(evaluate(partial,{resourceLimits:{maxWork:29}}).reason,'resource_limit');
  assert.equal(evaluate(partial,{resourceLimits:{maxWork:30}}).reason,'incompatible_operand');
  const full=clock(civil('2024-03-01T00:00:00'),'0.0001');
  const size=Buffer.byteLength(JSON.stringify(full));
  assert.deepEqual(clock(civil('2024-03-01T00:00:00'),'0.0001',{resourceLimits:{maxResultBytes:size}}),full);
  assert.equal(clock(civil('2024-03-01T00:00:00'),'0.0001',{resourceLimits:{maxResultBytes:size-1}}).context.stage,7);
  assert.equal(clock(civil('2024-03-01T00:00:00'),'0.0001',{resourceLimits:{maxWorkspaceDigits:16}}).context.stage,6);
  for(const limits of [null,[],{maxWork:null},{maxWork:true},{unknown:2}]) assert.throws(()=>limited(limits),TypeError);
});

test('native ingress bounds shared graph expansion, retains -0 width and rejects duplicate keys', () => {
  let reads=0;
  for(const size of [20,24]) {
    let graph=[]; for(let i=0;i<size;i++) { const child=graph;graph=[];for(let j=0;j<2;j++) Object.defineProperty(graph,j,{enumerable:true,get(){reads++;return child;}}); }
    const before=reads; const result=evaluate(graph,{resourceLimits:{maxRequestBytes:256,maxRequestDepth:100}});
    assert.equal(result.reason,'resource_limit');assert.ok(reads-before<260);
  }
  const cycle={};cycle.self=cycle;assert.equal(evaluate(cycle).reason,'invalid_operand');
  const raw=JSON.stringify(request('equal',{temporal:{category:'container',payload:0}},null,civil('2024-03-01T09:30'))).replace('"payload":0','"payload":-0');
  const parsed=parseRationalArithmeticEnvelope('{"fixture":{"request":'+raw+'}}').fixture.request;
  assert.equal(evaluate(parsed).reason,'unsupported_domain');
  assert.equal(evaluate(parsed,{resourceLimits:{maxRequestBytes:Buffer.byteLength(raw)-1}}).context.stage,1);
  assert.equal(evaluateAeonicCivilDateTimeText('{"operation":"equal","operation":"compare"}').context.stage,2);
});

test('clock amounts reuse finite Number grammar without repairing leading zeroes',()=>{
  for(const value of ['01','00','-01.2','+01e2']) {
    const result=clock(civil('2024-03-01T09:30:00'),value);
    assert.deepEqual(result,{outcome:'diagnostic',reason:'invalid_operand',context:{stage:4,path:'/input/amount/number/value'}});
  }
  for(const value of ['0','0.1','.1','+1','-0','1E+0002']) assert.equal(clock(civil('2024-03-01T09:30:00'),value).outcome,'value');
  assert.equal(clock(civil('2024-03-01T09:30:00'),'01',{resourceLimits:{maxNumericCharacters:1}}).reason,'resource_limit');
});

test('temporal text allowance counts scalars before invalid date syntax',()=>{
  for(const value of ['😀','é']) {
    assert.equal(clock(civil(value),'0',{resourceLimits:{maxTemporalCharacters:0}}).reason,'resource_limit');
    assert.equal(clock(civil(value),'0',{resourceLimits:{maxTemporalCharacters:1}}).reason,'invalid_operand');
  }
});
