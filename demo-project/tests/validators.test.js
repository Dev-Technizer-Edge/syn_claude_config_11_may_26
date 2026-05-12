'use strict';

const { validatePhone } = require('../src/utils/validators');

describe('validatePhone', () => {
  describe('valid inputs', () => {
    test('accepts E.164 format with country code', () => {
      expect(validatePhone('+12025551234')).toBe(true);
    });

    test('accepts local format with hyphens', () => {
      expect(validatePhone('555-867-5309')).toBe(true);
    });

    test('accepts format with spaces and parentheses', () => {
      expect(validatePhone('(555) 867-5309')).toBe(true);
    });

    test('accepts digits with dots', () => {
      expect(validatePhone('555.867.5309')).toBe(true);
    });

    test('accepts minimum length of 7 digits', () => {
      expect(validatePhone('1234567')).toBe(true);
    });

    test('accepts exactly 15 significant characters', () => {
      expect(validatePhone('+123456789012345')).toBe(true);
    });

    test('trims surrounding whitespace before validating', () => {
      expect(validatePhone('  +12025551234  ')).toBe(true);
    });
  });

  describe('invalid inputs — too short or too long', () => {
    test('rejects string shorter than 7 characters', () => {
      expect(validatePhone('123')).toBe(false);
    });

    test('rejects string longer than 15 characters', () => {
      expect(validatePhone('12345678901234567890')).toBe(false);
    });
  });

  describe('invalid inputs — wrong type', () => {
    test('rejects null', () => {
      expect(validatePhone(null)).toBe(false);
    });

    test('rejects undefined', () => {
      expect(validatePhone(undefined)).toBe(false);
    });

    test('rejects a number', () => {
      expect(validatePhone(12025551234)).toBe(false);
    });

    test('rejects an object', () => {
      expect(validatePhone({ phone: '+12025551234' })).toBe(false);
    });
  });

  describe('invalid inputs — bad format', () => {
    test('rejects empty string', () => {
      expect(validatePhone('')).toBe(false);
    });

    test('rejects string with letters', () => {
      expect(validatePhone('555-CALL-NOW')).toBe(false);
    });

    test('rejects string with only whitespace', () => {
      expect(validatePhone('       ')).toBe(false);
    });
  });
});
