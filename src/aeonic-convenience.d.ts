import type {
  AeonicArithmeticRequest, AeonicArithmeticOptions, AeonicArithmeticDiagnostic,
  AeonicArithmeticValueResult, AeonicArithmeticMaterializeRequest,
  AeonicFiniteNumber, AeonicArithmeticHistory,
} from './aeonic-arithmetic.js';
import type {
  AeonicRationalArithmeticRequest, AeonicRationalArithmeticOptions,
  AeonicRationalArithmeticDiagnostic, AeonicRationalArithmeticMetadata,
  AeonicQuantizationPolicy, AeonicRationalMaterializationPolicy,
} from './aeonic-rational-arithmetic.js';

type Materialized<M, S extends string> = {
  readonly outcome: 'value';
  readonly value: { readonly number: AeonicFiniteNumber; readonly history: AeonicArithmeticHistory };
  readonly metadata: { readonly steps: readonly { readonly step: S; readonly metadata: M }[] };
};
export type AeonicArithmeticOutputPolicy = AeonicArithmeticMaterializeRequest['input']['policy'];
export type AeonicRationalOutputPolicy = AeonicRationalMaterializationPolicy & { readonly quantize?: AeonicQuantizationPolicy };
export type AeonicArithmeticCombinedResult =
  | Materialized<AeonicArithmeticValueResult['metadata'], 'calculation' | 'materialization'>
  | (AeonicArithmeticDiagnostic & { readonly step: 'calculation' | 'materialization' });
export type AeonicRationalArithmeticCombinedResult =
  | Materialized<AeonicRationalArithmeticMetadata, 'calculation' | 'quantization' | 'materialization'>
  | (AeonicRationalArithmeticDiagnostic & { readonly step: 'calculation' | 'quantization' | 'materialization' });
/** Application composition, not a frozen operation result. Family is explicit; errors have no partial value. */
export function evaluateAeonicArithmeticAndMaterialize(request: AeonicArithmeticRequest, output: AeonicArithmeticOutputPolicy, options?: AeonicArithmeticOptions): AeonicArithmeticCombinedResult;
export function evaluateAeonicArithmeticAndMaterializeText(requestText: string, output: AeonicArithmeticOutputPolicy, options?: AeonicArithmeticOptions): AeonicArithmeticCombinedResult;
/** Quantization is explicit. Metadata retains each operation's policy/evaluation and the final history. */
export function evaluateAeonicRationalArithmeticAndMaterialize(request: AeonicRationalArithmeticRequest, output: AeonicRationalOutputPolicy, options?: AeonicRationalArithmeticOptions): AeonicRationalArithmeticCombinedResult;
export function evaluateAeonicRationalArithmeticAndMaterializeText(requestText: string, output: AeonicRationalOutputPolicy, options?: AeonicRationalArithmeticOptions): AeonicRationalArithmeticCombinedResult;
