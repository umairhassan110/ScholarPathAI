/**
 * Matching Engine — Utility functions for scholarship eligibility scoring
 * Extracted for testability (used by index.js matching endpoint)
 */

// ── Weights ──
const WEIGHTS = { cgpa: 0.20, field: 0.25, degree: 0.20, ielts: 0.15, experience: 0.15, country: 0.05 };

// ── Field Groups (related fields accepted) ──
const FIELD_GROUPS = {
  'Computer Science': ['Computer Science', 'Data Science', 'Artificial Intelligence', 'Software Engineering', 'Information Technology', 'Machine Learning', 'Cybersecurity'],
  'Data Science': ['Data Science', 'Computer Science', 'Statistics', 'Artificial Intelligence', 'Machine Learning'],
  'Electrical Engineering': ['Electrical Engineering', 'Electronics', 'Robotics', 'Mechatronics', 'Computer Engineering'],
  'Business Administration': ['Business Administration', 'MBA', 'Management', 'Finance', 'Marketing', 'Economics', 'Accounting'],
  'Medicine': ['Medicine', 'Health Sciences', 'Nursing', 'Pharmacy', 'Biomedical Sciences', 'Public Health'],
  'Law': ['Law', 'Legal Studies', 'International Law', 'Criminal Justice'],
  'Artificial Intelligence': ['Artificial Intelligence', 'Computer Science', 'Machine Learning', 'Data Science', 'Robotics'],
};

// ── Degree Normalization ──
function normalizeDegree(deg) {
  if (!deg) return '';
  const d = deg.trim().toLowerCase().replace(/['']/g, '').replace(/\s+/g, ' ');
  if (['bs', 'ba', 'bsc', 'bachelor', 'bachelors', 'bachelor degree', 'bs degree', 'ba degree', 'undergraduate', 'ug'].includes(d)) return 'bachelors';
  if (d.includes('bachelor')) return 'bachelors';
  if (['ms', 'ma', 'msc', 'master', 'masters', 'master degree', 'ms degree', 'ma degree', 'mba', 'graduate', 'postgraduate', 'pg'].includes(d)) return 'masters';
  if (d.includes('master')) return 'masters';
  if (['phd', 'doctorate', 'doctoral', 'ph.d', 'ph.d.', 'dphil'].includes(d)) return 'phd';
  if (d.includes('phd') || d.includes('doctor')) return 'phd';
  if (['fsc', 'intermediate', 'inter', 'fa', 'hssc', '12th', 'f.a', 'f.sc'].includes(d)) return 'fsc';
  return d;
}

// ── Degree Matching ──
function degreesMatch(profileDeg, scholarshipDeg) {
  const pd = normalizeDegree(profileDeg);
  const scholarshipText = String(scholarshipDeg || '').toLowerCase();
  if (isDegreeCompatible(profileDeg, scholarshipDeg)) {
    const hasMultipleLevels = /[,/|&]|\band\b/.test(scholarshipText);
    if (hasMultipleLevels) return 'exact';
  }
  const sd = normalizeDegree(scholarshipDeg);
  if (!pd || !sd) return null;
  if (pd === sd) return 'exact';
  if (pd === 'bachelors' && sd === 'masters') return 'progression';
  if (pd === 'masters' && sd === 'phd') return 'progression';
  return 'mismatch';
}

// Scholarship listings may support several levels in one text value.
function isDegreeCompatible(profileDeg, scholarshipDeg) {
  if (!profileDeg || !scholarshipDeg) return true;
  const value = String(scholarshipDeg).toLowerCase();
  if (/all levels|all degrees|undergraduate and graduate|bachelor.*master.*phd/.test(value)) return true;
  const profile = normalizeDegree(profileDeg);
  if (profile === 'bachelors') return /bachelor|undergraduate|bs\b|ba\b|bsc\b/.test(value);
  if (profile === 'masters') return /master|graduate|postgraduate|ms\b|ma\b|msc\b|mba\b/.test(value);
  if (profile === 'phd') return /phd|doctor|doctoral|dphil/.test(value);
  return true;
}

// ── Field Matching ──
function fieldsMatch(profileField, scholarshipField) {
  if (!profileField || !scholarshipField) return null;
  const pf = profileField.trim().toLowerCase();
  const sf = scholarshipField.trim().toLowerCase();
  if (pf === sf) return 'exact';
  const group = FIELD_GROUPS[profileField] || [];
  if (group.some(f => f.toLowerCase() === sf)) return 'related';
  return 'mismatch';
}

// ── Deadline Validation ──
function isDeadlineValid(deadlineStr) {
  if (!deadlineStr) return true;
  const d = new Date(deadlineStr);
  if (isNaN(d.getTime())) return true;
  d.setHours(23, 59, 59, 999);
  return d >= new Date();
}

module.exports = { WEIGHTS, FIELD_GROUPS, normalizeDegree, degreesMatch, isDegreeCompatible, fieldsMatch, isDeadlineValid };
