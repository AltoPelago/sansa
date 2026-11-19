import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAeonicCivilAnchor as anchor, evaluateAeonicCivilAnchorText, AEONIC_TEMPORAL_CIVIL_ANCHOR_PROFILE as profile } from '@altopelago/sansa';
import { evaluateAeonicCivilClock } from '@altopelago/sansa';
import { evaluateAeonicCivilDateTime } from '@altopelago/sansa';
const date = value => ({ temporal: { category: 'civilDate', value } });
const clock = value => ({ temporal: { category: 'civilClock', value } });
const point = (day, time = '00:00:00') => ({ kind: 'point', at: { day, time } });
const set = pieces => ({ temporal: { category: 'civilClockSet', pieces }, originClockForm: 'undeclared', history: 'none-declared' });
const request = (a = date('2024-02-28'), c = clock('09:30:00')) => ({ operation: 'anchor', input: { anchor: a, clock: c, context: { profile } } });

test('clock results anchor and feed real date-time arithmetic without metadata loss', () => {
  const carried = evaluateAeonicCivilClock({ operation:'shiftClock',input:{value:clock('23:30:00'),amount:{number:{category:'finiteNumber',value:'7200'},history:'approximation-declared'},context:{profile:'aeonic.operations.temporal.civil-clock.v1'}} });
  const computed = { temporal:{category:'civilDateSet',ranges:[{start:'2024-02-28',end:'2024-02-28'}]},originGranularity:'month',history:'clamping-declared' };
  const q=request(computed,carried.value), saved=structuredClone(q), result=anchor(q);
  assert.equal(result.value.temporal.pieces[0].at,'2024-02-29T01:30:00');
  assert.deepEqual(result.value.history,{clamping:'clamping-declared',approximation:'approximation-declared'});
  assert.equal(result.value.originDateGranularity,'month');assert.equal(result.value.originClockForm,'second');
  const next=evaluateAeonicCivilDateTime({operation:'shiftClock',input:{value:result.value,amount:{number:{category:'finiteNumber',value:'0.5'}},context:{profile:'aeonic.operations.temporal.civil-datetime.v1'}}});
  assert.equal(next.value.temporal.pieces[0].at,'2024-02-29T01:30:00.5');assert.deepEqual(next.value.history,result.value.history);
  assert.deepEqual(q,saved);
});

test('all interval memberships, missing midnight and multi-day extents translate exactly', () => {
  for(const includeStart of [false,true])for(const includeEnd of [false,true]){
    const q=request(date('2024-02-28'),set([{kind:'interval',start:{day:'-1',time:'23:59:59.1'},end:{day:'1',time:'00:00:00.1'},includeStart,includeEnd}]));
    assert.deepEqual(anchor(q).value.temporal.pieces,[{kind:'interval',start:'2024-02-27T23:59:59.1',end:'2024-02-29T00:00:00.1',includeStart,includeEnd}]);
  }
  const pieces=[{kind:'interval',start:{day:'0',time:'23:59:59'},end:{day:'1',time:'00:00:00'},includeStart:true,includeEnd:false},{kind:'interval',start:{day:'1',time:'00:00:00'},end:{day:'1',time:'00:00:01'},includeStart:false,includeEnd:true}];
  assert.equal(anchor(request(undefined,set(pieces))).value.temporal.pieces.length,2);
  const long=set([{kind:'interval',start:{day:'0',time:'00:00:00'},end:{day:'100',time:'00:00:00'},includeStart:true,includeEnd:false}]);
  const output=anchor(request(date('2024-01-01'),long),{resourceLimits:{maxWork:2,maxInputPieces:1,maxIntermediatePieces:1,maxOutputPieces:1}});
  assert.equal(output.value.temporal.pieces[0].end,'2024-04-10T00:00:00');
});

test('domain checks precede output admission and only an excluded exact upper boundary survives', () => {
  const result=anchor(request(date('9999-12-31'),clock('23:59')));
  assert.deepEqual(result.value.temporal.pieces[0].end,{boundary:'endOfDomain'});
  for(const day of ['1','-1']){
    const q=request(date(day==='1'?'9999-12-31':'0001-01-01'),set([point(day)]));
    assert.deepEqual(anchor(q,{resourceLimits:{maxOutputPieces:0}}),{outcome:'diagnostic',reason:'unrepresentable_result',context:{stage:7,path:null}});
  }
  const bad=request(date('2024-02'),clock('bad'));
  assert.equal(anchor(bad,{resourceLimits:{maxWork:0}}).context.path,'/input/clock/temporal/value');
  assert.equal(anchor(request(date('2024-02')),{resourceLimits:{maxWork:1}}).reason,'resource_limit');
});

test('huge admitted days and fractions never require BigInt or fractional-grid expansion', () => {
  const original=globalThis.BigInt;globalThis.BigInt=()=>{throw new Error('Unexpected numerical expansion');};
  try{
    assert.equal(anchor(request(undefined,set([point('1'.repeat(5000))])),{resourceLimits:{maxRelativeDayDigits:5000}}).reason,'unrepresentable_result');
    assert.equal(anchor(request(undefined,set([point('0','09:30:00.'+'1'.repeat(5000))])),{resourceLimits:{maxTemporalCharacters:5010,maxFractionDigits:5000}}).value.temporal.pieces[0].at.length,5020);
    for(const width of [128,256]){
      assert.equal(anchor(request(undefined,set([point('1'.repeat(width))]))).reason,'unrepresentable_result');
      const fraction='1'.repeat(width);assert.equal(anchor(request(undefined,set([point('0','09:30:00.'+fraction)]))).value.temporal.pieces[0].at,'2024-02-28T09:30:00.'+fraction);
    }
  }finally{globalThis.BigInt=original;}
});

test('all eleven trusted settings are closed and errors never produce values', () => {
  for(const resourceLimits of [null,[],{unknown:1},{maxWork:true},{maxWork:-1},{maxWork:1.5},{maxWork:2**53}])assert.throws(()=>anchor(request(),{resourceLimits}),TypeError);
  const q=request();delete q.input.context;
  assert.deepEqual(anchor(q),{outcome:'diagnostic',reason:'invalid_policy',context:{stage:3,path:'/input/policy/profile'}});
  for(const [limits,stage] of [[{maxRequestBytes:0},1],[{maxInputRanges:0},4],[{maxInputPieces:0},4],[{maxRelativeDayDigits:0},4],[{maxWork:1},6],[{maxIntermediatePieces:0},6],[{maxOutputPieces:0},7],[{maxResultBytes:0},7]]){
    const result=anchor(request(),{resourceLimits:limits});assert.equal(result.context.stage,stage);assert.ok(!Object.hasOwn(result,'value'));
  }
});

test('successful envelope bytes are admitted exactly before text rendering', () => {
  const q=request(undefined,set([point('0','09:30:00.'+'1'.repeat(128))])),result=anchor(q),bytes=Buffer.byteLength(JSON.stringify(result));
  assert.deepEqual(anchor(q,{resourceLimits:{maxResultBytes:bytes}}),result);
  assert.equal(anchor(q,{resourceLimits:{maxResultBytes:bytes-1}}).context.stage,7);
  const pad=String.prototype.padStart;let renders=0;
  String.prototype.padStart=function(...args){renders++;return pad.apply(this,args);};
  try{assert.equal(anchor(q,{resourceLimits:{maxResultBytes:0}}).context.stage,7);assert.equal(renders,0);}
  finally{String.prototype.padStart=pad;}
});

test('native shared graphs, cycles, duplicate keys and raw token widths remain bounded', () => {
  for(const depth of [20,24]){
    let reads=0,v={};for(let i=0;i<depth;i++){const child=v;v={get a(){reads++;return child;},get b(){reads++;return child;}};}
    const q=request({temporal:{category:'container',v}}),result=anchor(q,{resourceLimits:{maxRequestBytes:2048}});
    assert.equal(result.reason,'resource_limit');assert.ok(reads<1024);
  }
  const cycle={};cycle.self=cycle;assert.equal(anchor(cycle).reason,'invalid_operand');
  assert.equal(evaluateAeonicCivilAnchorText('{"operation":"anchor","operation":"anchor","input":{}}').context.stage,2);
  const q=JSON.stringify(request({temporal:{category:'container',payload:0}})).replace('"payload":0','"payload":-0');
  assert.equal(evaluateAeonicCivilAnchorText(q,{resourceLimits:{maxRequestBytes:Buffer.byteLength(q)-1}}).context.stage,1);
});
