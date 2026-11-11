import type { SansaSelector } from './index.js';
/** Supported synchronous host-cursor API. See docs/selector-cursor.md. */
export interface SansaSelectorCursor {
  peekSyntax(): string;
  readonly index: number;
  consume(char: string): unknown;
  match(char: string): boolean;
  matchRangeSeparator(): boolean;
  parseQuotedPayload(): string;
  parseIdentifier(context: string): string;
  /** Optional non-structural capability; reference hosts omit it. */
  parseChildIdentity?(): { readonly type: 'childIdentity'; readonly identity: string };
  parseOptionalPositionIndex(): number | null;
  fail(message: string, code: string, index?: number): never;
}
export function parseDotSelectorFromCursor<T = SansaSelector>(cursor: SansaSelectorCursor, member?: (name: string, quoted: boolean) => T): SansaSelector | T;
export function parsePositionSelectorFromCursor<T = SansaSelector>(cursor: SansaSelectorCursor, position?: (index: number) => T): SansaSelector | T;

export function validatePositionIndex(raw: string, maxPositionIndex: number | undefined, fail: (message: string, code: string) => never): number;
