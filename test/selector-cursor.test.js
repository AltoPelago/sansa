import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDotSelectorFromCursor,parsePositionSelectorFromCursor,validatePositionIndex} from '@altopelago/sansa/parsing/selector-cursor';
function fail(message,code){throw Object.assign(new Error(message),{code});}
function cursor(tokens){
 let offset=0;return {
  get index(){return offset;},
  peekSyntax(){return typeof tokens[offset]==='string'?tokens[offset]:'';},
  consume(char){assert.equal(tokens[offset++],char);},
  match(char){if(tokens[offset]!==char)return false;offset++;return true;},
  matchRangeSeparator(){return this.match('..');},
  parseIdentifier(){const name=tokens[offset++];assert.equal(typeof name,'string');return name;},
  parseQuotedPayload(){return tokens[offset++].quoted;},
  parseOptionalPositionIndex(){if(['..',']'].includes(tokens[offset]))return null;return validatePositionIndex(tokens[offset++],undefined,fail);},fail,
 };
}
test('supported cursor export projects member and positional steps',()=>{
 const c=cursor(['.','name']);assert.equal(parseDotSelectorFromCursor(c,(name,quoted)=>({key:name,quoted})).key,'name');assert.equal(c.index,2);
 const q=cursor(['.','[',{quoted:'a.b'},']']);assert.deepEqual(parseDotSelectorFromCursor(q),( {type:'member',name:'a.b',quoted:true}));assert.equal(q.index,4);
 const p=cursor(['[','999999',']']);assert.equal(parsePositionSelectorFromCursor(p,n=>n),999999);assert.equal(p.index,3);
});
test('cursor parsing retains native non-reference selector grammar',()=>{
 assert.deepEqual(parseDotSelectorFromCursor(cursor(['.','@'])),{type:'attributeSpace'});
 assert.deepEqual(parseDotSelectorFromCursor(cursor(['.','*','*'])),{type:'descendantExpansion'});
 assert.deepEqual(parsePositionSelectorFromCursor(cursor(['[','1','..','4',']'])),{type:'positionRange',start:1,end:4});
});
test('cursor failure preserves host diagnostic identity',()=>{
 assert.deepEqual(parseDotSelectorFromCursor(cursor(['.','[',{quoted:''},']'])),{type:'member',name:'',quoted:true});
 assert.throws(()=>parsePositionSelectorFromCursor(cursor(['[','..',']'])),e=>e.code==='SANSA_EMPTY_POSITION_RANGE');
 assert.throws(()=>validatePositionIndex('1e2',undefined,fail),e=>e.code==='SANSA_EXPECTED_INDEX');
});
