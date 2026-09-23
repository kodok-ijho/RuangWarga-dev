/**
 * Pure Money Module for RuangWarga Multi-Tenant SaaS
 * Sub-Gate: 8.1-C2
 * 
 * Provides deterministic integer minor-unit arithmetic (1 Rupiah = 100 sen).
 * Strictly zero floating-point accumulation during monetary calculations.
 */

export class MalformedMonetaryError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MalformedMonetaryError';
  }
}

export class IntegerOverflowError extends Error {
  constructor(message) {
    super(message);
    this.name = 'IntegerOverflowError';
  }
}

const MONETARY_STRING_REGEX = /^(-)?(\d+)(?:\.(\d{1,2}))?$/;

/**
 * Parses a 2-decimal monetary string or integer into integer minor units (sen).
 * Deterministic string parsing: NO floating-point multiplication (Math.round(val * 100)).
 * 
 * Contract:
 * - "100" -> 10000
 * - "100.00" -> 10000
 * - "100.5" -> 10050
 * - "0.10" -> 10
 * - "0.01" -> 1
 * - "0.10" + "0.20" -> 30 minor units
 * 
 * Rejections:
 * - Rejects null, undefined, empty string, or whitespace.
 * - Rejects non-numeric characters, multiple dots, commas.
 * - Rejects precision greater than 2 decimal places (e.g. "100.555").
 * - Guards against JavaScript integer overflow (Number.isSafeInteger).
 * 
 * @param {string|number} rawValue
 * @returns {number} Integer minor units
 */
export function toMinorUnits(rawValue) {
  if (rawValue === null || rawValue === undefined) {
    throw new MalformedMonetaryError('Monetary value cannot be null or undefined.');
  }

  const str = String(rawValue).trim();
  if (str === '') {
    throw new MalformedMonetaryError('Monetary string cannot be empty.');
  }

  const match = str.match(MONETARY_STRING_REGEX);
  if (!match) {
    throw new MalformedMonetaryError(
      `Malformed monetary string: "${str}". Value must be a valid 2-decimal numeric string.`
    );
  }

  const isNegative = Boolean(match[1]);
  const integerPart = match[2];
  const fractionalPart = (match[3] || '').padEnd(2, '0');

  // Strip leading zeros on integer part to avoid octal or excessive length, but keep single 0
  const normalizedIntPart = integerPart.replace(/^0+(?=\d)/, '');
  const combinedStr = `${isNegative ? '-' : ''}${normalizedIntPart}${fractionalPart}`;

  const num = Number(combinedStr);
  if (!Number.isSafeInteger(num)) {
    throw new IntegerOverflowError(`Monetary value exceeds safe integer range: "${str}"`);
  }

  return num === 0 ? 0 : num;
}

/**
 * Formats an integer minor unit (sen) into an authoritative 2-decimal string.
 * Strictly used at boundary output/display only.
 * 
 * Examples:
 * - 10000 -> "100.00"
 * - 10050 -> "100.50"
 * - 1 -> "0.01"
 * - 30 -> "0.30"
 * - -5025 -> "-50.25"
 * - 0 -> "0.00"
 * 
 * @param {number} minorUnits - Must be a safe integer
 * @returns {string} 2-decimal string representation
 */
export function fromMinorUnits(minorUnits) {
  if (typeof minorUnits !== 'number' || !Number.isInteger(minorUnits)) {
    throw new MalformedMonetaryError(`minorUnits must be an integer, received: ${minorUnits}`);
  }

  if (!Number.isSafeInteger(minorUnits)) {
    throw new IntegerOverflowError(`minorUnits exceeds safe integer range: ${minorUnits}`);
  }

  const isNegative = minorUnits < 0;
  const abs = Math.abs(minorUnits);
  const intPart = Math.floor(abs / 100);
  const fracPart = String(abs % 100).padStart(2, '0');

  return `${isNegative ? '-' : ''}${intPart}.${fracPart}`;
}

/**
 * Safe integer addition with overflow guard.
 */
export function safeAdd(a, b) {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b)) {
    throw new IntegerOverflowError(`Inputs must be safe integers: ${a}, ${b}`);
  }
  const sum = a + b;
  if (!Number.isSafeInteger(sum)) {
    throw new IntegerOverflowError(`Integer overflow in monetary addition: ${a} + ${b}`);
  }
  return sum;
}

/**
 * Safe integer subtraction with overflow guard.
 */
export function safeSubtract(a, b) {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b)) {
    throw new IntegerOverflowError(`Inputs must be safe integers: ${a}, ${b}`);
  }
  const diff = a - b;
  if (!Number.isSafeInteger(diff)) {
    throw new IntegerOverflowError(`Integer overflow in monetary subtraction: ${a} - ${b}`);
  }
  return diff;
}
