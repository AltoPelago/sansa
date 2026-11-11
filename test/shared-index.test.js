import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAddress} from '../src/index.js';
import {validatePositionIndex} from '@altopelago/sansa/parsing/selector-cursor';
test('shared decimal index grammar rejects malformed spelling before conversion',()=>{
 for(const raw of ['1.5','1e2','-0','+1','00','01','1_0','0x10','1000000','9007199254740993']){
  assert.throws(()=>validatePositionIndex(raw,undefined,(message)=>{throw new Error(message)}));
  assert.equal(parseAddress(`$.a[${raw}]`).ok,false);
 }
 for(const raw of ['0','1','999999'])assert.equal(validatePositionIndex(raw,undefined,()=>{throw new Error()}),Number(raw));
 const result=parseAddress('$.a[1000000]',{maxPositionIndex:1000000});assert.equal(result.ok,true);
 assert.ok(result.warnings.some(w=>w.code==='SANSA_NON_PORTABLE_POSITION_INDEX'));
});
