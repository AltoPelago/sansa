// Adapted from SANSA src/index.js at 4f05ea935a684ada91a8cd6f8f75367730c1430f.
// Copyright (c) 2026 Patrik. MIT; see LICENSE and docs/aeonic-comparison.md.
// Input grammar and resource checks belong to the staged operation boundary.
export const FINITE_NUMBER = /^[+-]?(?:(?:0|[1-9][0-9]*)(?:\.[0-9]+)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$(?![\s\S])/u;

function parts(value) {
  const match = /^([+-]?)(?:(0|[1-9][0-9]*)(?:\.([0-9]+))?|\.([0-9]+))(?:[eE]([+-]?[0-9]+))?$(?![\s\S])/u.exec(value);
  const fraction = match[3] ?? match[4] ?? '';
  const digits = `${match[2] ?? ''}${fraction}`.replace(/^0+/u, '');
  if (digits.length === 0) return { sign: 0, digits: '0', scale: 0n };
  return {
    sign: match[1] === '-' ? -1 : 1,
    digits,
    scale: BigInt(match[5] ?? '0') - BigInt(fraction.length),
  };
}

export function compareFiniteNumbers(left, right) {
  const a = parts(left);
  const b = parts(right);
  if (a.sign !== b.sign) return a.sign < b.sign ? -1 : 1;
  if (a.sign === 0) return 0;
  const aOrder = BigInt(a.digits.length) + a.scale;
  const bOrder = BigInt(b.digits.length) + b.scale;
  let comparison;
  if (aOrder !== bOrder) comparison = aOrder < bOrder ? -1 : 1;
  else {
    const width = Math.max(a.digits.length, b.digits.length);
    const aDigits = a.digits.padEnd(width, '0');
    const bDigits = b.digits.padEnd(width, '0');
    comparison = aDigits === bDigits ? 0 : aDigits < bDigits ? -1 : 1;
  }
  return a.sign === -1 ? -comparison : comparison;
}
