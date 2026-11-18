import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { evaluateAeonicCivilClock as evaluate, evaluateAeonicCivilClockText, AEONIC_TEMPORAL_CIVIL_CLOCK_PROFILE as profile } from '@altopelago/sansa';
const civil = value => ({ temporal: { category: 'civilClock', value } });
const at = (day, time = '00:00:00') => ({ day, time });
const derived = pieces => ({ temporal: { category: 'civilClockSet', pieces }, originClockForm: 'undeclared', history: 'none-declared' });
const point = (day, time) => ({ kind: 'point', at: at(day, time) });
const request = (operation, value, policy, other) => ({ operation, input: { context: { profile }, ...(['equal','compare','relate'].includes(operation) ? { left: value, right: other } : { value, ...(operation === 'shiftClock' ? { amount: other } : {}) }), ...(policy ? { policy } : {}) } });
const shift = (v, value, options) => evaluate(request('shiftClock', v, null, { number: { category: 'finiteNumber', value } }), options);

test('midnight carry, negative floor, exact reversal and metadata survive chains', () => {
  const original = civil('23:30:00'), saved = structuredClone(original), first = shift(original, '7200');
  assert.deepEqual(first.value.temporal.pieces, [point('1','01:30:00')]);
  assert.deepEqual(shift(first.value, '-7200').value.temporal.pieces, [point('0','23:30:00')]);
  assert.deepEqual(shift(civil('00:00:00'), '-0.5').value.temporal.pieces, [point('-1','23:59:59.5')]);
  const marked = evaluate(request('shiftClock', first.value, null, { number: { category:'exactNumber', coefficient:'0', exponent:'0' }, history:'approximation-declared' }));
  assert.equal(marked.value.history,'approximation-declared');assert.equal(marked.value.originClockForm,'second');
  assert.equal(shift(marked.value,'-90000').value.history,'approximation-declared');assert.deepEqual(original,saved);
  assert.equal(evaluate(request('equal',first.value,null,civil('01:30:00'))).value.value,'notEqual');
});

test('exact intervals retain missing boundary points, flags and signed numeric day order', () => {
  const value = derived([{ kind:'interval', start:at('-1','23:59:59'), end:at('0'), includeStart:true, includeEnd:false },{ kind:'interval', start:at('0'), end:at('0','00:00:01'), includeStart:false, includeEnd:true }]);
  assert.equal(shift(value,'0.5').value.temporal.pieces.length,2);
  assert.equal(evaluate(request('relate',value,null,derived([point('0')]))).value.value,'disjoint');
  assert.equal(evaluate(request('compare',value,null,derived([point('0')]))).value.value,'indeterminate');
  assert.equal(evaluate(request('compare',derived([point('2')]),null,derived([point('10')]))).value.value,'before');
  assert.equal(evaluate(request('compare',derived([point('-10')]),null,derived([point('-2')]))).value.value,'before');
});

test('all endpoint memberships agree with an independent finite atom oracle', () => {
  const cases=[];
  for(const [a,b] of [[0,1],[1,2],[0,2],[2,3]]) for(const il of [false,true]) for(const ih of [false,true]) {
    const members=new Set(Array.from({length:7},(_,i)=>i).filter(i=>(i>a*2||il&&i===a*2)&&(i<b*2||ih&&i===b*2)));
    cases.push({value:derived([{kind:'interval',start:at('0',`00:00:0${a}`),end:at('0',`00:00:0${b}`),includeStart:il,includeEnd:ih}]),members,min:a*2,max:b*2,il,ih});
  }
  for(let a=0;a<4;a++)cases.push({value:derived([point('0',`00:00:0${a}`)]),members:new Set([2*a]),min:2*a,max:2*a,il:true,ih:true});
  const subset=(a,b)=>[...a].every(x=>b.has(x)), before=(a,b)=>a.max<b.min||a.max===b.min&&!(a.ih&&b.il);
  for(const a of cases)for(const b of cases){
    const equal=subset(a.members,b.members)&&subset(b.members,a.members),relation=equal?'equal':subset(a.members,b.members)?'containedBy':subset(b.members,a.members)?'contains':[...a.members].some(x=>b.members.has(x))?'overlaps':'disjoint';
    assert.equal(evaluate(request('relate',a.value,null,b.value)).value.value,relation);
    assert.equal(evaluate(request('compare',a.value,null,b.value)).value.value,equal?'equal':before(a,b)?'before':before(b,a)?'after':'indeterminate');
  }
});

test('complete forms step without wrapping; output cannot discard carry', () => {
  const result=evaluate(request('step',civil('23:'),{clockForm:'hour',count:'1'}));
  assert.deepEqual(result.value.temporal.pieces[0],{kind:'interval',start:at('1'),end:at('1','01:00:00'),includeStart:true,includeEnd:false});
  assert.equal(evaluate(request('materialize',result.value,{clockForm:'hour'})).reason,'unrepresentable_result');
  assert.equal(evaluate(request('materialize',civil('23:'),{clockForm:'hour'})).value.temporal.value,'23:');
  const fractional=shift(civil('23:59'),'0.5').value;
  assert.equal(evaluate(request('step',fractional,{clockForm:'minute',count:'1'})).reason,'incompatible_operand');
  assert.equal(evaluate(request('step',fractional,{clockForm:'minute',count:'1'}),{resourceLimits:{maxWork:1}}).reason,'resource_limit');
  assert.equal(evaluate(request('materialize',fractional,{clockForm:'minute'}),{resourceLimits:{maxIntermediatePieces:0}}).context.stage,6);
});

test('resource recipes guard count conversion, powers, zero work and excluded output days', () => {
  const count='1'.repeat(32), r=request('step',civil('00:00:00'),{clockForm:'second',count});
  const original=globalThis.BigInt;let calls=0;
  try {globalThis.BigInt=x=>{if(x===count)calls++;return original(x);};assert.equal(evaluate(r,{resourceLimits:{maxWorkspaceDigits:6}}).context.stage,6);assert.equal(calls,0);} finally {globalThis.BigInt=original;}
  for(const n of ['1e1000000','1e-1000000'])assert.equal(shift(civil('00:00:00'),n).context.stage,6);
  assert.equal(shift(civil('00:00:00'),'0e1000000',{resourceLimits:{maxWorkspaceDigits:0}}).outcome,'value');
  assert.equal(shift(civil('00:00:00'),'0e1000001').context.stage,4);
  assert.equal(shift(civil('23:'),'777600',{resourceLimits:{maxRelativeDayDigits:1}}).context.stage,7);
  assert.equal(shift(civil('23:'),'777600',{resourceLimits:{maxRelativeDayDigits:2}}).value.temporal.pieces[0].end.day,'10');
  const full=shift(civil('00:00:00'),'0.0001'),size=Buffer.byteLength(JSON.stringify(full));
  assert.deepEqual(shift(civil('00:00:00'),'0.0001',{resourceLimits:{maxResultBytes:size}}),full);
  assert.equal(shift(civil('00:00:00'),'0.0001',{resourceLimits:{maxResultBytes:size-1}}).context.stage,7);
});

test('canonical coordinates and malformed supported operands fail before deferred domains', () => {
  for(const day of ['-0','+1','01','1.0','1e0'])assert.equal(shift(derived([point(day)]),'0').reason,'invalid_operand');
  for(const value of ['09','24:00','00:00:60','T09:30','09:30Z','09:30+00:00','09:30&local'])assert.equal(shift(civil(value),'0').reason,'invalid_operand');
  for(const time of ['00:00:00.0','00:00:00.100'])assert.equal(shift(derived([point('0',time)]),'0').reason,'invalid_operand');
  const deferred={temporal:{category:'civilDateTime',opaque:null}}, result=evaluate(request('shiftClock',deferred,null,{number:{category:'finiteNumber',value:'01'}}));
  assert.equal(result.context.path,'/input/amount/number/value');assert.equal(result.context.stage,4);
  assert.equal(evaluate(request('equal',deferred,null,civil('09:30'))).reason,'unsupported_domain');
});

test('native graphs stop before exponential unfolding, and raw width/depth remain evidence', () => {
  for(const depth of [20,24]){
    let reads=0,v={};for(let i=0;i<depth;i++){const child=v;v={get a(){reads++;return child;},get b(){reads++;return child;}};}
    const result=evaluate({operation:'equal',input:{left:{temporal:{category:'container',v}},right:civil('09:30'),context:{profile}}},{resourceLimits:{maxRequestBytes:2048}});
    assert.equal(result.reason,'resource_limit');assert.ok(reads<1024,reads);
  }
  const cycle={};cycle.self=cycle;assert.equal(evaluate(cycle).reason,'invalid_operand');
  assert.equal(evaluateAeonicCivilClockText('{"operation":"equal","operation":"compare","input":{}}').context.stage,2);
  const raw=JSON.stringify({operation:'equal',input:{context:{profile},left:{temporal:{category:'container',payload:0}},right:civil('09:30')}}).replace('"payload":0','"payload":-0');
  assert.equal(evaluateAeonicCivilClockText(raw,{resourceLimits:{maxRequestBytes:Buffer.byteLength(raw)-1}}).context.stage,1);
  assert.equal(evaluateAeonicCivilClockText(raw,{resourceLimits:{maxRequestBytes:Buffer.byteLength(raw)}}).reason,'unsupported_domain');
});

test('trusted option errors stay separate from diagnostics; STDIO adapter preserves tokens', () => {
  for(const resourceLimits of [null,[],{unknown:1},{maxWork:null},{maxWork:true}])assert.throws(()=>shift(civil('09:30'),'0',{resourceLimits}),TypeError);
  const r=request('shiftClock',civil('09:30'),null,{number:{category:'finiteNumber',value:'0'}});
  for(const [exe,argv] of [[process.execPath,['scripts/cts-aeonic-temporal-civil-clock-adapter.mjs']]]){
    const envelope={lane:'aeonic-temporal-civil-clock',case_id:'binding',fixture:{request:r},policy:{}};
    const run=x=>spawnSync(exe,argv,{input:JSON.stringify(x),encoding:'utf8',timeout:10000});
    assert.equal(run(envelope).status,0);
    for(const resourceLimits of [null,[],{maxWork:true},{unknown:1}]){const result=run({...envelope,policy:{resourceLimits}});assert.notEqual(result.status,0);assert.equal(result.stdout,'');}
    const restricted=spawnSync(exe,[...argv,'--capability-set','relations'],{input:JSON.stringify(envelope),encoding:'utf8',timeout:10000});assert.equal(JSON.parse(restricted.stdout).result.reason,'unsupported_operation');
    const raw=JSON.stringify({operation:'equal',input:{context:{profile},left:{temporal:{category:'container',payload:0}},right:civil('09:30')}}).replace('"payload":0','"payload":-0');
    const transported=spawnSync(exe,argv,{input:'{"lane":"aeonic-temporal-civil-clock","case_id":"raw","fixture":{"request":'+raw+'},"policy":{"resourceLimits":{"maxRequestBytes":'+(Buffer.byteLength(raw)-1)+'}}}',encoding:'utf8',timeout:10000});
    assert.equal(transported.status,0,transported.stderr);assert.equal(JSON.parse(transported.stdout).result.context.stage,1);
  }
});

test('browser UTF-8 admission agrees with exact native/text byte boundaries', () => {
  for(const operation of ['é','😀','line\nfeed','quote"']) {
    const request={operation,input:{}},text=JSON.stringify(request),bytes=Buffer.byteLength(text);
    assert.deepEqual(evaluate(request,{resourceLimits:{maxRequestBytes:bytes}}),evaluateAeonicCivilClockText(text,{resourceLimits:{maxRequestBytes:bytes}}));
    assert.equal(evaluate(request,{resourceLimits:{maxRequestBytes:bytes-1}}).context.stage,1);
    assert.equal(evaluateAeonicCivilClockText(text,{resourceLimits:{maxRequestBytes:bytes-1}}).context.stage,1);
  }
});
