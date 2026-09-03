const { normalizeDegree, degreesMatch, isDegreeCompatible, fieldsMatch, isDeadlineValid, WEIGHTS } = require('../matching-engine');

// ═══════════════════════════════════════════════════════════════
// normalizeDegree
// ═══════════════════════════════════════════════════════════════
describe('normalizeDegree', () => {
  test('returns empty string for null/undefined/empty', () => {
    expect(normalizeDegree(null)).toBe('');
    expect(normalizeDegree(undefined)).toBe('');
    expect(normalizeDegree('')).toBe('');
  });

  test('normalizes Bachelor variants to "bachelors"', () => {
    expect(normalizeDegree('BS')).toBe('bachelors');
    expect(normalizeDegree('BA')).toBe('bachelors');
    expect(normalizeDegree('BSc')).toBe('bachelors');
    expect(normalizeDegree('Bachelor')).toBe('bachelors');
    expect(normalizeDegree("Bachelor's")).toBe('bachelors');
    expect(normalizeDegree('Bachelors')).toBe('bachelors');
    expect(normalizeDegree('Undergraduate')).toBe('bachelors');
    expect(normalizeDegree('BS degree')).toBe('bachelors');
    expect(normalizeDegree('Bachelor of Science')).toBe('bachelors');
  });

  test('normalizes Master variants to "masters"', () => {
    expect(normalizeDegree('MS')).toBe('masters');
    expect(normalizeDegree('MA')).toBe('masters');
    expect(normalizeDegree('MSc')).toBe('masters');
    expect(normalizeDegree('Master')).toBe('masters');
    expect(normalizeDegree("Master's")).toBe('masters');
    expect(normalizeDegree('MBA')).toBe('masters');
    expect(normalizeDegree('Postgraduate')).toBe('masters');
    expect(normalizeDegree('Master of Science')).toBe('masters');
  });

  test('normalizes PhD variants to "phd"', () => {
    expect(normalizeDegree('PhD')).toBe('phd');
    expect(normalizeDegree('Ph.D')).toBe('phd');
    expect(normalizeDegree('Ph.D.')).toBe('phd');
    expect(normalizeDegree('Doctorate')).toBe('phd');
    expect(normalizeDegree('Doctoral')).toBe('phd');
    expect(normalizeDegree('DPhil')).toBe('phd');
  });

  test('normalizes FSc variants to "fsc"', () => {
    expect(normalizeDegree('FSc')).toBe('fsc');
    expect(normalizeDegree('FA')).toBe('fsc');
    expect(normalizeDegree('Intermediate')).toBe('fsc');
    expect(normalizeDegree('HSSC')).toBe('fsc');
    expect(normalizeDegree('12th')).toBe('fsc');
  });

  test('trims whitespace and handles case insensitivity', () => {
    expect(normalizeDegree('  BACHELOR  ')).toBe('bachelors');
    expect(normalizeDegree('  masters  ')).toBe('masters');
    expect(normalizeDegree('  PHD  ')).toBe('phd');
  });
});

// ═══════════════════════════════════════════════════════════════
// degreesMatch
// ═══════════════════════════════════════════════════════════════
describe('degreesMatch', () => {
  test('returns null if either side is empty', () => {
    expect(degreesMatch(null, 'Masters')).toBeNull();
    expect(degreesMatch('BS', '')).toBeNull();
    expect(degreesMatch('', '')).toBeNull();
  });

  test('returns "exact" for same degree level', () => {
    expect(degreesMatch('BS', 'Bachelor')).toBe('exact');
    expect(degreesMatch("Bachelor's", 'BSc')).toBe('exact');
    expect(degreesMatch('MS', "Master's")).toBe('exact');
    expect(degreesMatch('PhD', 'Doctorate')).toBe('exact');
    expect(degreesMatch('FSc', 'Intermediate')).toBe('exact');
  });

  test('returns "progression" for Bachelor→Masters', () => {
    expect(degreesMatch('BS', 'Masters')).toBe('progression');
    expect(degreesMatch("Bachelor's", 'MS')).toBe('progression');
  });

  test('returns "progression" for Masters→PhD', () => {
    expect(degreesMatch('MS', 'PhD')).toBe('progression');
    expect(degreesMatch("Master's", 'Doctorate')).toBe('progression');
  });

  test('returns "mismatch" for incompatible degrees', () => {
    expect(degreesMatch('BS', 'PhD')).toBe('mismatch');
    expect(degreesMatch('MS', 'BS')).toBe('mismatch');
    expect(degreesMatch('PhD', 'BS')).toBe('mismatch');
    expect(degreesMatch('FSc', 'PhD')).toBe('mismatch');
  });
});

describe('isDegreeCompatible', () => {
  test('does not show PhD-only scholarships to Masters students', () => {
    expect(isDegreeCompatible("Master's", 'PhD')).toBe(false);
  });

  test('allows scholarships supporting Masters and PhD', () => {
    expect(isDegreeCompatible("Master's", "Master's / PhD")).toBe(true);
  });

  test('allows scholarships supporting all three levels', () => {
    expect(isDegreeCompatible("Master's", "Bachelor's, Master's, PhD")).toBe(true);
  });

  test('allows a scholarship that supports Masters and PhD only', () => {
    expect(isDegreeCompatible("Master's", 'Masters and PhD')).toBe(true);
    expect(isDegreeCompatible("Master's", 'Bachelor\'s')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// fieldsMatch
// ═══════════════════════════════════════════════════════════════
describe('fieldsMatch', () => {
  test('returns null if either side is empty', () => {
    expect(fieldsMatch(null, 'Computer Science')).toBeNull();
    expect(fieldsMatch('CS', '')).toBeNull();
    expect(fieldsMatch('', '')).toBeNull();
  });

  test('returns "exact" for identical fields (case insensitive)', () => {
    expect(fieldsMatch('Computer Science', 'Computer Science')).toBe('exact');
    expect(fieldsMatch('artificial intelligence', 'Artificial Intelligence')).toBe('exact');
  });

  test('returns "related" for fields in the same group', () => {
    expect(fieldsMatch('Computer Science', 'Data Science')).toBe('related');
    expect(fieldsMatch('Computer Science', 'Artificial Intelligence')).toBe('related');
    expect(fieldsMatch('Computer Science', 'Software Engineering')).toBe('related');
    expect(fieldsMatch('Artificial Intelligence', 'Machine Learning')).toBe('related');
    expect(fieldsMatch('Artificial Intelligence', 'Data Science')).toBe('related');
    expect(fieldsMatch('Business Administration', 'Finance')).toBe('related');
    expect(fieldsMatch('Medicine', 'Public Health')).toBe('related');
  });

  test('returns "mismatch" for unrelated fields', () => {
    expect(fieldsMatch('Computer Science', 'Medicine')).toBe('mismatch');
    expect(fieldsMatch('Law', 'Engineering')).toBe('mismatch');
    expect(fieldsMatch('Medicine', 'Computer Science')).toBe('mismatch');
  });
});

// ═══════════════════════════════════════════════════════════════
// isDeadlineValid
// ═══════════════════════════════════════════════════════════════
describe('isDeadlineValid', () => {
  test('returns true for null/empty/invalid dates', () => {
    expect(isDeadlineValid(null)).toBe(true);
    expect(isDeadlineValid('')).toBe(true);
    expect(isDeadlineValid('not-a-date')).toBe(true);
  });

  test('returns true for future dates', () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    expect(isDeadlineValid(future.toISOString())).toBe(true);
  });

  test('returns false for past dates', () => {
    const past = new Date();
    past.setFullYear(past.getFullYear() - 1);
    expect(isDeadlineValid(past.toISOString())).toBe(false);
  });

  test('returns true for today (edge of deadline)', () => {
    const today = new Date().toISOString().split('T')[0];
    expect(isDeadlineValid(today)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// WEIGHTS
// ═══════════════════════════════════════════════════════════════
describe('WEIGHTS', () => {
  test('all weights sum to 1.0', () => {
    const sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
    expect(Math.round(sum * 100) / 100).toBe(1.0);
  });

  test('each weight is between 0 and 1', () => {
    Object.values(WEIGHTS).forEach(w => {
      expect(w).toBeGreaterThan(0);
      expect(w).toBeLessThanOrEqual(1);
    });
  });
});
