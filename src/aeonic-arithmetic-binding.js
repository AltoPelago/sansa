// Adapted from Aeonic at 9433ce2d57200dec2efe50ed0c02bf6b74e636e9 (MIT).
import { parseStrictJson } from './aeonic-json.js';

function exactLimit(token, value) {
  if (!Number.isSafeInteger(value) || value < 0) return false;
  const [mantissa, exponent = '0'] = token.toLowerCase().split('e');
  const fraction = mantissa.split('.')[1] ?? '';
  let digits = mantissa.replace(/^-|\./gu, '').replace(/^0+/u, '');
  // Underflow of a nonzero literal must not turn it into an integer zero.
  if (value === 0) return digits.length === 0;
  const e = Number(exponent);
  if (!Number.isSafeInteger(e) || Math.abs(e) > token.length + 32) return false;
  const trimmed = digits.replace(/0+$/u, '');
  const scale = e - fraction.length + digits.length - trimmed.length;
  digits = trimmed;
  if (scale < 0 || digits.length + scale > 16) return false;
  return Number((mantissa.startsWith('-') ? '-' : '') + digits + '0'.repeat(scale)) === value;
}

/** Retain the mathematical integer constraint at the trusted JSON boundary.
 * JSON.parse alone can round fractional tokens into apparently safe integers.
 * The validated token stream is scanned iteratively, including escaped keys.
 */
export function parseArithmeticEnvelope(text) {
  const result = parseStrictJson(text), frames = [];
  const path = () => {
    const f = frames.at(-1);
    // Only the root policy/resourceLimits path matters. Retaining complete
    // paths would use quadratic memory on deeply nested logical fixtures.
    return f ? f.path.length === 4 ? f.path : [...f.path, f.object ? f.key : f.index] : [];
  };
  const done = () => {
    const f = frames.at(-1);
    if (f) { f.state = 'comma'; if (!f.object) f.index++; }
  };
  for (let i = 0; i < text.length;) {
    const c = text[i];
    if (/\s/u.test(c)) { i++; continue; }
    if (c === '{' || c === '[') {
      const at = path(); done(); frames.push({ path: at, object: c === '{', state: c === '{' ? 'key' : 'value', key: null, index: 0 }); i++;
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
      const at = path(), token = text.slice(start, i);
      if (at.length === 3 && at[0] === 'policy' && at[1] === 'resourceLimits' && !exactLimit(token, Number(token))) {
        throw new TypeError('Trusted resource limit must be an exact nonnegative safe integer');
      }
      done();
    } else { i += c === 't' || c === 'n' ? 4 : 5; done(); }
  }
  return result;
}
