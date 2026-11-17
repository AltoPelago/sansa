import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

test('property Resolve regression mirrors retain exact prepared CTS source bytes',()=>{
  // CTS3edc3e27c657f1420c1bda3447c960df549b3427; preparation remains excluded.
  for(const [name,hash]of [
    ['property-resolve-candidate-v1.json','3cafd875d3341719f4cb2b2b2fcc1d48404e2a9644c8b83ff6a8b80336690cba'],
    ['property-namespace-candidate-v1.json','867feaee7445b4bbb7d86ed84c0b8ce18523ebbc1ec76cd4f845b24aec273a83'],
  ]) for(const prefix of ['../fixtures/','../implementations/rust/crates/sansa-runtime/tests/fixtures/']) {
    assert.equal(createHash('sha256').update(readFileSync(new URL(prefix+name,import.meta.url))).digest('hex'),hash,name);
  }
});
