'use strict';

const { validatePhone, validatePasswordStrength } = require('../src/utils/validators');

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

describe('validatePasswordStrength', () => {
  describe('valid passwords', () => {
    test('accepts password meeting all requirements', () => {
      expect(validatePasswordStrength('Secure@Pass1')).toBe(true);
    });

    test('accepts exactly 10 characters with all required character classes', () => {
      expect(validatePasswordStrength('Abc123!@#d')).toBe(true);
    });

    test('accepts password with multiple special characters', () => {
      expect(validatePasswordStrength('Str0ng!@#$%Password')).toBe(true);
    });

    test('accepts password with special character at start', () => {
      expect(validatePasswordStrength('!Uppercase1abc')).toBe(true);
    });

    test('accepts password with special character at end', () => {
      expect(validatePasswordStrength('Uppercase1abc!')).toBe(true);
    });

    test('accepts a variety of special characters', () => {
      const specials = ['!', '@', '#', '$', '%', '^', '&', '*', '-', '_', '=', '+'];
      for (const ch of specials) {
        expect(validatePasswordStrength(`Abcdefg1${ch}h`)).toBe(true);
      }
    });
  });

  describe('invalid — too short', () => {
    test('rejects password with 9 characters even if all classes present', () => {
      expect(validatePasswordStrength('Abc123!@d')).toBe(false);
    });

    test('rejects empty string', () => {
      expect(validatePasswordStrength('')).toBe(false);
    });
  });

  describe('invalid — missing character class', () => {
    test('rejects password missing uppercase letter', () => {
      expect(validatePasswordStrength('nouppercase1!')).toBe(false);
    });

    test('rejects password missing lowercase letter', () => {
      expect(validatePasswordStrength('NOLOWERCASE1!')).toBe(false);
    });

    test('rejects password missing digit', () => {
      expect(validatePasswordStrength('NoDigitsHere!')).toBe(false);
    });

    test('rejects password missing special character', () => {
      expect(validatePasswordStrength('NoSpecialChar1')).toBe(false);
    });

    test('rejects password that is only digits', () => {
      expect(validatePasswordStrength('12345678901')).toBe(false);
    });

    test('rejects password that is only letters', () => {
      expect(validatePasswordStrength('OnlyLettersHere')).toBe(false);
    });
  });

  describe('invalid — wrong type', () => {
    test('rejects null', () => {
      expect(validatePasswordStrength(null)).toBe(false);
    });

    test('rejects undefined', () => {
      expect(validatePasswordStrength(undefined)).toBe(false);
    });

    test('rejects a number', () => {
      expect(validatePasswordStrength(12345678901)).toBe(false);
    });

    test('rejects an array', () => {
      expect(validatePasswordStrength(['Secure@Pass1'])).toBe(false);
    });

    test('rejects an object', () => {
      expect(validatePasswordStrength({ password: 'Secure@Pass1' })).toBe(false);
    });
  });

  describe('boundary — length exactly at threshold', () => {
    test('accepts exactly 10-character password with all classes', () => {
      expect(validatePasswordStrength('Abcde1!fgh')).toBe(true);
    });

    test('rejects 9-character password with all classes', () => {
      expect(validatePasswordStrength('Abcd1!efg')).toBe(false);
    });

    test('accepts long password (50+ chars) with all classes', () => {
      expect(validatePasswordStrength('A'.repeat(40) + 'a'.repeat(5) + '1!' )).toBe(true);
    });
  });
});
