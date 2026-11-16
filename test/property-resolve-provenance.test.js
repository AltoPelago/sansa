import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

test('property Resolve regression mirrors retain exact prepared CTS source bytes',()=>{
  // CTS3edc3e27c657f1420c1bda3447c960df549b3427; preparation remains excluded.
  for(const [name,hash]of [
    ['property-resolve-candidate-v1.json','724ea13d00ccf53c23cee502fa7f858925f2ef4b1e0e591759750e18d4290ec2'],
    ['property-namespace-candidate-v1.json','7261bc7219b49e8f8c03b2b43e931ac611fafd2fc3e48b28dd3e51f2e4072b16'],
  ]) for(const prefix of ['../fixtures/','../implementations/rust/crates/sansa-runtime/tests/fixtures/']) {
    assert.equal(createHash('sha256').update(readFileSync(new URL(prefix+name,import.meta.url))).digest('hex'),hash,name);
  }
});
