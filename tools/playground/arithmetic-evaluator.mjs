import {
  evaluateAeonicArithmeticText, evaluateAeonicRationalArithmeticText,
  evaluateAeonicArithmeticAndMaterializeText, evaluateAeonicRationalArithmeticAndMaterializeText,
} from '../../src/index.js';
import { parseStrictJson, exceedsJsonDepth } from '../../src/aeonic-json.js';
import { parseRationalArithmeticEnvelope } from '../../src/aeonic-rational-json.js';
import { validateArithmeticInput, ARITHMETIC_LIMITS } from './arithmetic-model.mjs';

export function evaluateArithmeticPlayground(input) {
  validateArithmeticInput(input);
  const rational = input.lane === 'rational';
  if (!Object.hasOwn(input, 'outputPolicyText')) {
    return (rational ? evaluateAeonicRationalArithmeticText : evaluateAeonicArithmeticText)(input.requestText);
  }
  const text = input.outputPolicyText;
  if (/[\uD800-\uDFFF]/u.test(text) || exceedsJsonDepth(text, ARITHMETIC_LIMITS.policyDepth)) {
    throw new TypeError('Output policy must be scalar JSON text within depth 8.');
  }
  // Standalone validation prevents escaping the synthetic wrapper. Preserve raw
  // numeric tokens so invalid policy values reach the owning policy validator.
  parseStrictJson(text);
  const output = parseRationalArithmeticEnvelope('{"fixture":{"request":' + text + '}}').fixture.request;
  return (rational ? evaluateAeonicRationalArithmeticAndMaterializeText : evaluateAeonicArithmeticAndMaterializeText)(input.requestText, output);
}
