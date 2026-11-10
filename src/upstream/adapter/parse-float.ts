// D2 style values use strconv.ParseFloat, whose syntax differs from Number().
// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0

const digit = String.raw`\d(?:_?\d)*`;
const hexDigit = String.raw`[\da-f](?:_?[\da-f])*`;
const decimal = new RegExp(
  String.raw`^[+-]?(?:${digit}(?:\.(?:${digit})?)?|\.${digit})(?:e[+-]?${digit})?$`,
  'i',
);
const hexadecimal = new RegExp(
  String.raw`^([+-]?)0x(_?${hexDigit}(?:\.(?:${hexDigit})?)?|\.${hexDigit})p([+-]?${digit})$`,
  'i',
);

/** Parse a finite Go float. Invalid and non-finite inputs return NaN. */
export function parseGoFloat(value: string): number {
  if (decimal.test(value)) {
    const result = Number(value.replaceAll('_', ''));
    return Number.isFinite(result) ? result : NaN;
  }
  const match = hexadecimal.exec(value);
  if (!match) return NaN;
  const mantissa = match[2]!.replaceAll('_', '');
  const [integer, fraction = ''] = mantissa.split('.');
  const digits = (integer! + fraction).replace(/^0+/, '');
  if (!digits) return match[1] === '-' ? -0 : 0;
  const bits = (digits.length - 1) * 4 + Math.floor(Math.log2(Number.parseInt(digits[0]!, 16))) + 1;
  const power = Number(match[3]!.replaceAll('_', '')) - 4 * fraction.length;
  const exponent = power + bits - 1;
  if (exponent > 1023) return NaN;
  if (exponent < -1075) return match[1] === '-' ? -0 : 0;
  const integerValue = BigInt(`0x${digits}`);
  const roundRight = (n: bigint, shift: number): bigint => {
    if (shift <= 0) return n << BigInt(-shift);
    if (shift > bits) return 0n;
    const s = BigInt(shift), quotient = n >> s;
    const remainder = n - (quotient << s), half = 1n << (s - 1n);
    return quotient + (remainder > half || (remainder === half && (quotient & 1n) === 1n) ? 1n : 0n);
  };
  let result: number;
  if (exponent < -1022) result = Number(roundRight(integerValue, -(power + 1074))) * Number.MIN_VALUE;
  else result = Number(roundRight(integerValue, bits - 53)) / 2 ** 52 * 2 ** exponent;
  if (!Number.isFinite(result)) return NaN;
  return match[1] === '-' ? -result : result;
}
