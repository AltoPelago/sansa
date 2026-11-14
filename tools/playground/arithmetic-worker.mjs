import { evaluateArithmeticPlayground } from './arithmetic-evaluator.mjs';
import { ARITHMETIC_LIMITS, utf8Bytes } from './arithmetic-model.mjs';
self.onmessage = ({ data }) => {
  try {
    const result = evaluateArithmeticPlayground(data);
    const text = JSON.stringify(result);
    if (text.length > ARITHMETIC_LIMITS.resultBytes || utf8Bytes(text, ARITHMETIC_LIMITS.resultBytes) > ARITHMETIC_LIMITS.resultBytes) {
      throw new RangeError('Playground result exceeds 1 MiB.');
    }
    self.postMessage({ status: 'completed', result });
  } catch (error) {
    self.postMessage({ status: 'error', error: error instanceof Error ? error.message : String(error) });
  }
};
