// Adapted from Aeonic rational arithmetic/convenience at 64347f19181041f86135e958da5a16ecc4b60b57.
// Copyright (c) 2026 Patrik. MIT; see LICENSE and docs/aeonic-rational-arithmetic.md.
import { parseArithmeticEnvelope } from './aeonic-arithmetic-binding.js';

// Internal binding representation; ordinary native nonfinite Numbers still fail.
export class RationalJsonNumber {
  constructor(text) { this.text = text; }
}

export function parseRationalArithmeticEnvelope(text) {
  const result = parseArithmeticEnvelope(text), frames = [];
  const location = () => {
    const parent = frames.at(-1);
    if (!parent) return { value: result, logical: false, fixture: false, root: true };
    const key = parent.object ? parent.key : parent.index;
    return { value: parent.value[key], parent: parent.value, key,
      logical: parent.logical || (parent.fixture && parent.object && key === 'request'),
      fixture: parent.root && parent.object && key === 'fixture', root: false };
  };
  const done = () => {
    const parent = frames.at(-1);
    if (parent) { parent.state = 'comma'; if (!parent.object) parent.index++; }
  };
  // The existing strict decoder has already checked grammar/duplicate keys and
  // exact trusted limits. Retain numeric token spellings only inside request.
  // Full envelope transport remains outside the logical operation budget.
  for (let i = 0; i < text.length;) {
    const c = text[i];
    if (/\s/u.test(c)) { i++; continue; }
    if (c === '{' || c === '[') {
      const at = location(); done();
      frames.push({ ...at, object: c === '{', state: c === '{' ? 'key' : 'value', key: null, index: 0 }); i++;
    } else if (c === '}' || c === ']') { frames.pop(); i++; }
    else if (c === ':') { frames.at(-1).state = 'value'; i++; }
    else if (c === ',') { const f = frames.at(-1); f.state = f.object ? 'key' : 'value'; i++; }
    else if (c === '"') {
      const start = i++;
      while (i < text.length) { if (text[i] === '\\') i += 2; else if (text[i++] === '"') break; }
      const f = frames.at(-1);
      if (f?.object && f.state === 'key') { f.key = JSON.parse(text.slice(start, i)); f.state = 'colon'; }
      else done();
    } else if (c === '-' || /[0-9]/u.test(c)) {
      const start = i++;
      while (i < text.length && /[0-9eE+.\-]/u.test(text[i])) i++;
      const at = location();
      if (at.logical) at.parent[at.key] = new RationalJsonNumber(text.slice(start, i));
      done();
    } else { i += c === 't' || c === 'n' ? 4 : 5; done(); }
  }
  return result;
}
