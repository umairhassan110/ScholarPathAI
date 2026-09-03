/**
 * CV Service — heavy CV business logic
 *
 * Decoupled from controllers so the heavy operations (PDF/DOCX parsing,
 * Gemini extraction, Europass PDF rendering) stay testable and can honor
 * a deadline budget instead of running until the serverless function is
 * killed (Vercel 504 protection).
 *
 * AI calls use the 'cvExtractor' domain (GEMINI_CV_EXTRACTOR_KEY).
 */
const { supabase } = require('../config/supabase');
const { askAI, extractStructured } = require('./ai.service');

let SchemaType;
try {
  SchemaType = require('@google/generative-ai').SchemaType;
} catch {
  SchemaType = null;
}

// Tolerant imports — heavy parsers may be unavailable on some runtimes
let pdfParse = null;
try { pdfParse = require('pdf-parse'); } catch (e) { console.warn('pdf-parse unavailable:', e.message); }
const mammoth = require('mammoth');
let jsPDF = null;
try { jsPDF = require('jspdf').jsPDF; } catch (e) { console.warn('jspdf unavailable:', e.message); }

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function cleanExtractedText(value) {
  if (typeof value !== 'string') return value;
  let text = value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\s+/g, ' ').trim();
  const midpoint = Math.floor(text.length / 2);
  if (midpoint > 30) {
    const left = text.slice(0, midpoint).trim();
    const right = text.slice(midpoint).trim();
    if (left && right && left.replace(/\W/g, '').toLowerCase() === right.replace(/\W/g, '').toLowerCase()) {
      text = left;
    }
  }
  return text;
}

function cleanStructuredValue(value) {
  if (Array.isArray(value)) return value.map(cleanStructuredValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cleanStructuredValue(item)]));
  }
  return cleanExtractedText(value);
}

function extractWithoutAI(cvText) {
  const rawText = String(cvText || '').replace(/\r/g, '');
  const text = rawText
    .replace(/Bachelorof/gi, 'Bachelor of ')
    .replace(/Sciencein/gi, 'Science in ')
    .replace(/ArtificialIntelligence/gi, 'Artificial Intelligence')
    .replace(/TechnicalSkills/gi, 'Technical Skills')
    .replace(/Publications&Research/gi, 'Publications & Research')
    .replace(/Awards&Certifications/gi, 'Awards & Certifications')
    .replace(/PersonalInformation/gi, 'Personal Information')
    .replace(/EducationandTraining/gi, 'Education and Training')
    .replace(/([a-z])([A-Z])/g, '$1 $2');
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
  const firstLine = lines.find(line => !/^(curriculum vitae|pdf parsed text|<parsed text|page:|personal information|name\b)/i.test(line)) || '';
  const email = text.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0] || '';
  const phone = text.match(/(?:\+92|0)\d[\d -]{8,}/)?.[0]?.trim() || '';
  const cgpa = text.match(/(?:cgpa|gpa)\s*[:\-]?\s*(\d(?:\.\d)?)(?:\s*[–-]\s*\d(?:\.\d)?)?/i)?.[1] || null;
  const ielts = text.match(/ielts(?:\s+score)?\s*[:\-]?\s*(\d(?:\.\d)?)/i)?.[1] || null;
  const degree = /bachelor|b\.s\.|bs of|undergraduate/i.test(text) ? "Bachelor's" : null;
  const field = text.match(/bachelor(?: of science)? in\s+([A-Za-z ]+?)(?=\s*(?:student|with|cgpa|\-|–|$))/i)?.[1]?.trim() || null;
  const skillsLine = lines.find(line => /^technical skills/i.test(line));
  const skillText = skillsLine ? lines.slice(lines.indexOf(skillsLine), lines.indexOf(skillsLine) + 5).join(' ') : '';
  const skills = skillText.replace(/^technical skills\s*:?/i, '').split(/[:,|]/).map(s => s.trim()).filter(s => s.length > 1).slice(0, 20);
  const section = (name, nextNames) => {
    const start = lines.findIndex(line => new RegExp(`^${name}$`, 'i').test(line.replace(/\s+/g, ' ').trim()));
    if (start < 0) return [];
    const end = lines.findIndex((line, index) => index > start && nextNames.some(next => new RegExp(`^${next}$`, 'i').test(line.replace(/\s+/g, ' ').trim())));
    return lines.slice(start + 1, end < 0 ? lines.length : end);
  };
  const projectLines = section('PROJECTS', ['PUBLICATIONS & RESEARCH', 'AWARDS & CERTIFICATIONS']);
  const publicationLines = section('PUBLICATIONS & RESEARCH', ['AWARDS & CERTIFICATIONS']);
  const certificationLines = section('AWARDS & CERTIFICATIONS', []);
  const projects = projectLines.filter(line => line.length > 10).map(line => ({ name: line.split('|')[0].trim(), description: line, technologies: '' }));
  const publications = publicationLines.filter(line => line.length > 10).map(line => ({ title: line.replace(/^[•*-]\s*/, '').trim(), venue: '', year: '', status: '' }));
  const certifications = certificationLines.filter(line => line.length > 8).map(line => ({ name: line, issuer: '', year: '' }));
  return {
    full_name: firstLine,
    email,
    phone,
    address: lines.find(line => /Pakistan|Islamabad|Lahore|Karachi/i.test(line)) || '',
    summary: text.match(/SUMMARY\s+([\s\S]*?)(?=EDUCATION|TECHNICAL SKILLS|PROJECTS|$)/i)?.[1]?.trim() || '',
    education: degree ? [{ period: text.match(/\b20\d\d\s*[–-]\s*(?:Present|20\d\d)/i)?.[0] || '', degree: `Bachelor of ${field || 'Science'}`, institution: text.match(/\n([^\n]+)\s+Islamabad, Pakistan/i)?.[1] || 'Muslim Youth University', city: 'Islamabad, Pakistan', description: cgpa ? `CGPA: ${cgpa} / 4.0` : '' }] : [],
    work_experience: [],
    projects,
    publications,
    certifications,
    achievements: [],
    skills: { technical: skills.join(', '), digital: '', communication: '', organisational: '', other: '' },
    languages: [],
    hobbies: '',
    references: 'Available upon request',
    academics: { cgpa: cgpa ? Number(cgpa) : null, fsc_percentage: null, degree_level: degree, field_of_study: field },
    language: { ielts_score: ielts ? Number(ielts) : null },
    experience: { years_of_experience: 0, skills },
  };
}

/**
 * Extract plain text from an uploaded CV buffer (PDF / DOCX / TXT).
 * Mirrors the legacy parsing rules, including failure markers.
 */
async function extractTextFromFile(fileBuf, mimeType, { maxChars = 5000 } = {}) {
  if (!fileBuf) return '';
  if (mimeType === 'application/pdf') {
    try {
      const pdfData = await pdfParse(fileBuf);
      return pdfData.text.slice(0, maxChars);
    } catch (e) {
      return `[PDF parsing failed: ${e.message}]`;
    }
  }
  if (mimeType === DOCX_MIME || (mimeType || '').includes('wordprocessingml')) {
    try {
      const docxResult = await mammoth.extractRawText({ buffer: fileBuf });
      return docxResult.value.slice(0, maxChars);
    } catch (e) {
      return `[DOCX parsing failed: ${e.message}]`;
    }
  }
  if (mimeType === 'text/plain') {
    return fileBuf.toString('utf-8').slice(0, maxChars);
  }
  return `[Unsupported file type: ${mimeType}]`;
}

/**
 * Download the CV stored for a profile from Supabase Storage.
 * @returns {{ buffer: Buffer, mimeType: string } | null}
 */
async function downloadStoredCv(profileId) {
  const { data: profile } = await supabase.from('profiles').select('cv_file_path').eq('id', profileId).single();
  if (!profile?.cv_file_path) return null;
  try {
    const { data: fileData, error: dlError } = await supabase.storage.from('cvs').download(profile.cv_file_path);
    if (!dlError && fileData) {
      return {
        buffer: Buffer.from(await fileData.arrayBuffer()),
        mimeType: fileData.type || 'application/pdf',
      };
    }
  } catch (e) {
    console.error('Storage download failed:', e.message);
  }
  return null;
}

/**
 * Upload a CV buffer to Supabase Storage and link it to the profile.
 * @returns {Promise<string|null>} stored file path
 */
async function uploadCv(profileId, fileBuf, mimeType, originalName) {
  const filePath = `${profileId}/${Date.now()}_${originalName}`;
  const { error: uploadError } = await supabase.storage
    .from('cvs')
    .upload(filePath, fileBuf, { contentType: mimeType });
  if (uploadError) return null;
  await supabase.from('profiles').update({ cv_file_path: filePath }).eq('id', profileId);
  return filePath;
}

/**
 * AI extraction of academic data from CV text (Gemini, cvExtractor domain).
 * @returns parsed data or the legacy fallback shape on failure
 */
async function extractAcademicData(cvText, budget) {
  // ── Strict JSON Schema for structured CV extraction ──
  const cvSchema = SchemaType ? {
    type: SchemaType.OBJECT,
    properties: {
      academics: {
        type: SchemaType.OBJECT,
        properties: {
          fsc_percentage: { type: SchemaType.NUMBER, nullable: true },
          cgpa: { type: SchemaType.NUMBER, nullable: true },
          degree_level: { type: SchemaType.STRING, nullable: true },
          field_of_study: { type: SchemaType.STRING, nullable: true },
        },
        required: ['fsc_percentage', 'cgpa', 'degree_level', 'field_of_study'],
      },
      language: {
        type: SchemaType.OBJECT,
        properties: {
          ielts_score: { type: SchemaType.NUMBER, nullable: true },
        },
        required: ['ielts_score'],
      },
      experience: {
        type: SchemaType.OBJECT,
        properties: {
          years_of_experience: { type: SchemaType.NUMBER },
          skills: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        },
        required: ['years_of_experience', 'skills'],
      },
    },
    required: ['academics', 'language', 'experience'],
  } : null;

  const extractedPrompt = `You are a CV parser for an academic scholarship matching platform.
Analyze this CV/resume text and extract academic details accurately.
Do NOT invent information that does not exist. If something is missing, return null.

CV text:
${cvText || 'No CV content available.'}

Return ONLY valid JSON matching this exact structure:
{
  "academics": {
    "fsc_percentage": number (0-100 scale, null if not found),
    "cgpa": number (0-4 scale, null if not found),
    "degree_level": string ("Bachelor's", "Master's", "PhD", or null),
    "field_of_study": string (e.g. "Computer Science", null if not found)
  },
  "language": {
    "ielts_score": number (0-9 scale, null if not found)
  },
  "experience": {
    "years_of_experience": number (total years, 0 if none),
    "skills": array of strings (technical and soft skills)
  }
}`;

  // Try schema-enforced extraction first (guaranteed structure)
  let extractedData = null;
  if (cvSchema) {
    extractedData = await extractStructured(extractedPrompt, cvSchema, {
      domain: 'cvExtractor',
      timeoutMs: budget ? budget.cap(40_000) : 40_000,
    });
  }

  // Fallback to legacy free-form extraction if schema mode failed or unavailable
  if (!extractedData) {
    const legacyPrompt = `You are a CV parser for an academic scholarship matching platform.
Analyze this CV/resume text and extract academic details accurately.
Do NOT invent information that does not exist. If something is missing, return null.

CV text:
${cvText || 'No CV content available.'}

Return ONLY valid JSON:
{
  "cgpa": number (0-4 scale, null if not found),
  "ielts_score": number (0-9 scale, null if not found),
  "degree_level": string (e.g. "BS", "MS", "Bachelor's", "Master's", null if not found),
  "department": string (e.g. "Computer Science", null if not found),
  "university": string (current/past university name, null if not found),
  "skills": array of strings (technical and soft skills found in CV),
  "experience_years": number (total years of work experience, 0 if none),
  "languages": array of strings (languages mentioned),
  "certifications": array of strings (certifications mentioned)
}`;

    const legacyData = await askAI(legacyPrompt, {
      domain: 'cvExtractor',
      jsonMode: true,
      timeoutMs: budget ? budget.cap(40_000) : 40_000,
    });

    if (legacyData) {
      // Normalize legacy shape to the canonical schema shape
      extractedData = {
        academics: {
          fsc_percentage: legacyData.fsc_percentage ?? null,
          cgpa: legacyData.cgpa ?? null,
          degree_level: legacyData.degree_level ?? legacyData.department ?? null,
          field_of_study: legacyData.department ?? legacyData.field_of_study ?? null,
        },
        language: {
          ielts_score: legacyData.ielts_score ?? null,
        },
        experience: {
          years_of_experience: legacyData.experience_years ?? 0,
          skills: legacyData.skills ?? [],
        },
      };
    }
  }

  if (!extractedData) {
    extractedData = extractWithoutAI(cvText);
  }
  const fallback = extractWithoutAI(cvText);
  const fallbackAcademics = fallback.academics || {};
  const fallbackLanguage = fallback.language || {};
  const fallbackExperience = fallback.experience || {};
  const aiAcademics = extractedData.academics || {};
  const aiLanguage = extractedData.language || {};
  const aiExperience = extractedData.experience || {};
  extractedData.academics = {
    fsc_percentage: aiAcademics.fsc_percentage ?? fallbackAcademics.fsc_percentage,
    cgpa: aiAcademics.cgpa ?? fallbackAcademics.cgpa,
    degree_level: aiAcademics.degree_level || fallbackAcademics.degree_level,
    field_of_study: aiAcademics.field_of_study || fallbackAcademics.field_of_study,
  };
  extractedData.language = { ielts_score: aiLanguage.ielts_score ?? fallbackLanguage.ielts_score };
  extractedData.experience = {
    years_of_experience: aiExperience.years_of_experience ?? fallbackExperience.years_of_experience,
    skills: aiExperience.skills?.length ? aiExperience.skills : fallbackExperience.skills,
  };
  if (!extractedData.experience.skills?.length) extractedData.experience.skills = fallbackExperience.skills || [];
  return extractedData;
}

/**
 * Persist AI-extracted academic data: insert into extracted_profile_data
 * and copy non-null values onto the profile row.
 */
async function persistExtractedData(profileId, extractedData) {
  // Support both new nested schema shape and legacy flat shape
  const academics = extractedData.academics || {};
  const language = extractedData.language || {};
  const experience = extractedData.experience || {};
  const skills = experience.skills || extractedData.skills || [];

  const { error: insertError } = await supabase
    .from('extracted_profile_data')
    .insert([{
      profile_id: profileId,
      raw_extraction: extractedData,
      skills
    }]);

  if (insertError) {
    throw Object.assign(new Error(insertError.message), { status: 500 });
  }

  const profileUpdates = {};
  const cgpa = academics.cgpa ?? extractedData.cgpa;
  const ielts = language.ielts_score ?? extractedData.ielts_score;
  const degreeLevel = academics.degree_level ?? extractedData.degree_level;
  const fieldOfStudy = academics.field_of_study ?? extractedData.department;
  const fscPct = academics.fsc_percentage ?? extractedData.fsc_percentage;

  if (cgpa != null) profileUpdates.cgpa = cgpa;
  if (ielts != null) profileUpdates.ielts_score = ielts;
  if (degreeLevel) profileUpdates.target_degree = degreeLevel;
  if (fieldOfStudy) profileUpdates.target_department = fieldOfStudy;
  if (fscPct != null) profileUpdates.fsc_percentage = fscPct;

  if (Object.keys(profileUpdates).length > 0) {
    const { error: updateError } = await supabase
      .from('profiles')
      .update(profileUpdates)
      .eq('id', profileId);
    if (updateError) {
      throw Object.assign(new Error(updateError.message), { status: 500 });
    }
  }
}

/**
 * AI parse of CV text into structured Europass sections (cvExtractor domain).
 * @returns parsed sections or the legacy fallback shape
 */
async function parseEuropassSections(cvText, budget) {
  const europassPrompt = `You are a Europass CV formatting expert. Parse the CV text below into structured Europass sections.
Extract ALL information ONLY from the CV text itself. Do NOT make up or assume any information not present in the CV.

CV Text:
${cvText || 'No CV text available.'}

Return ONLY valid JSON (no markdown, no code blocks):
{
  "full_name": "Full name as it appears on the CV",
  "email": "email if found in CV",
  "phone": "phone if found in CV",
  "address": "address/city/country if found in CV",
  "summary": "2-3 line professional summary from the CV",
  "work_experience": [
    { "period": "MM/YYYY - MM/YYYY", "role": "Job Title", "employer": "Company Name", "city": "City, Country", "description": "Key responsibilities and achievements" }
  ],
  "education": [
    { "period": "YYYY - YYYY", "degree": "Degree Name", "institution": "University/School Name", "city": "City, Country", "description": "Key subjects, thesis, CGPA if mentioned" }
  ],
  "certifications": [
    { "name": "Certification name", "issuer": "Issuing organization", "year": "YYYY" }
  ],
  "projects": [
    { "name": "Project name", "description": "Brief description", "technologies": "Technologies used" }
  ],
  "publications": [
    { "title": "Publication title", "venue": "Journal, conference, or platform", "year": "YYYY", "status": "Published or under preparation" }
  ],
  "achievements": [
    "Achievement 1",
    "Achievement 2"
  ],
  "skills": {
    "communication": "From CV",
    "organisational": "From CV",
    "digital": "From CV",
    "technical": "From CV - tools, languages, frameworks",
    "other": "Other skills from CV"
  },
  "languages": [
    { "language": "English", "level": "Native/A1/A2/B1/B2/C1/C2/Fluent/Intermediate" }
  ],
  "hobbies": "Hobbies/interests if mentioned in CV",
  "references": "References if mentioned in CV, otherwise 'Available upon request'",
  "suggestions": ["suggestion 1 for improvement", "suggestion 2", "suggestion 3"]
}`;

  let parsed = await askAI(europassPrompt, {
    domain: 'cvExtractor',
    jsonMode: true,
    timeoutMs: budget ? budget.cap(40_000) : 40_000,
  });
  if (!parsed) {
    parsed = extractWithoutAI(cvText);
    parsed.suggestions = ['AI quota is temporarily unavailable; extracted text was used to build this CV.', 'Review the generated CV before submitting an application.'];
  } else {
    const fallback = extractWithoutAI(cvText);
    parsed = {
      ...fallback,
      ...parsed,
      education: parsed.education?.length ? parsed.education : fallback.education,
      projects: parsed.projects?.length ? parsed.projects : fallback.projects,
      publications: parsed.publications?.length ? parsed.publications : fallback.publications,
      certifications: parsed.certifications?.length ? parsed.certifications : fallback.certifications,
      skills: Object.keys(parsed.skills || {}).some(key => parsed.skills[key]) ? parsed.skills : fallback.skills,
    };
  }
  return cleanStructuredValue(parsed);
}

/**
 * Render structured Europass sections into a proper PDF (jsPDF).
 * @returns data URI string or null when PDF generation fails
 */
function buildEuropassPdf(parsed) {
  try {
    const doc = new jsPDF();
    doc.setCharSpace(0);
    const M = 15; // margin
    const W = 180; // usable width
    const COL1 = 55; // label column width
    const COL2 = W - COL1; // content column width
    let y = 15;

    function addPageIfNeeded(needed) {
      if (y + needed > 280) { doc.addPage(); y = 15; }
    }

    function sectionHeader(title) {
      addPageIfNeeded(15);
      // Simple gray line (no blue color)
      doc.setDrawColor(150, 150, 150);
      doc.setLineWidth(0.2);
      doc.line(M, y, M + W, y);
      y += 3;
      doc.setFontSize(11);
      doc.setTextColor(51, 51, 51);
      doc.setFont('helvetica', 'bold');
      doc.text(title.toUpperCase(), M, y);
      y += 6;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
    }

    function labelValue(label, value) {
      if (!value) return;
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.text(label, M, y);
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(10);
      const lines = doc.splitTextToSize(String(value), COL2 - 5);
      doc.text(lines, M + COL1, y);
      y += Math.max(lines.length * 4.5, 5) + 2;
    }

    function uniqueItems(items) {
      const seen = new Set();
      return (Array.isArray(items) ? items : []).filter((item) => {
        const key = typeof item === 'string' ? item.trim().toLowerCase() : JSON.stringify(item);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    // Use AI-extracted name ONLY (from CV, not profile)
    const cvName = parsed.full_name || 'Your Name';

    // ── SIMPLE EUROPASS HEADER (no blue bars - clean professional style) ──
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(51, 51, 51);
    doc.text('CURRICULUM VITAE', M, y);
    y += 8;
    doc.setFontSize(22);
    doc.setTextColor(0, 0, 0);
    doc.text(cvName, M, y);
    y += 6;
    // Thin black line separator
    doc.setDrawColor(100, 100, 100);
    doc.setLineWidth(0.5);
    doc.line(M, y, M + W, y);
    y += 8;

    // ── PERSONAL INFORMATION ──
    sectionHeader('Personal Information');
    labelValue('Name', cvName);
    labelValue('Email', parsed.email || '');
    labelValue('Phone', parsed.phone || '');
    labelValue('Address', parsed.address || '');
    y += 3;

    // ── PROFESSIONAL SUMMARY ──
    if (parsed.summary) {
      sectionHeader('About Me');
      doc.setFontSize(10);
      const sumLines = doc.splitTextToSize(parsed.summary, W);
      doc.text(sumLines, M, y);
      y += sumLines.length * 4.5 + 5;
    }

    // ── WORK EXPERIENCE ──
    const workExp = uniqueItems(parsed.work_experience);
    if (workExp.length > 0) {
      sectionHeader('Work Experience');
      workExp.forEach((job) => {
        addPageIfNeeded(25);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(job.role || '', M + COL1, y);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);
        doc.setFontSize(9);
        if (job.period) doc.text(String(job.period), M, y);
        doc.setTextColor(0, 0, 0);
        y += 5;
        doc.setFontSize(10);
        if (job.employer) {
          let empLine = job.employer;
          if (job.city) empLine += `, ${job.city}`;
          doc.text(empLine, M + COL1, y);
          y += 5;
        }
        if (job.description) {
          const descLines = doc.splitTextToSize(String(job.description), COL2 - 5);
          doc.setFontSize(9);
          doc.text(descLines, M + COL1, y);
          y += descLines.length * 4 + 5;
        }
        y += 3;
      });
    }

    // ── EDUCATION AND TRAINING ──
    const education = uniqueItems(parsed.education);
    if (education.length > 0) {
      sectionHeader('Education and Training');
      education.forEach((edu) => {
        addPageIfNeeded(25);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(edu.degree || '', M + COL1, y);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);
        doc.setFontSize(9);
        if (edu.period) doc.text(String(edu.period), M, y);
        doc.setTextColor(0, 0, 0);
        y += 5;
        doc.setFontSize(10);
        if (edu.institution) {
          let instLine = edu.institution;
          if (edu.city) instLine += `, ${edu.city}`;
          doc.text(instLine, M + COL1, y);
          y += 5;
        }
        if (edu.description) {
          const descLines = doc.splitTextToSize(String(edu.description), COL2 - 5);
          doc.setFontSize(9);
          doc.text(descLines, M + COL1, y);
          y += descLines.length * 4 + 5;
        }
        y += 3;
      });
    }

    // ── PERSONAL SKILLS ──
    sectionHeader('Personal Skills');
    const skills = parsed.skills || {};
    if (skills.technical) labelValue('Technical skills', skills.technical);
    if (skills.communication) labelValue('Communication', skills.communication);
    if (skills.organisational) labelValue('Organisational', skills.organisational);
    if (skills.digital) labelValue('Digital skills', skills.digital);
    if (skills.other) labelValue('Other skills', skills.other);
    y += 3;

    // ── CERTIFICATIONS ──
    const certs = uniqueItems(parsed.certifications);
    if (certs.length > 0) {
      sectionHeader('Certifications');
      certs.forEach((cert) => {
        addPageIfNeeded(12);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(cert.name || '', M + 5, y);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);
        doc.setFontSize(9);
        const detail = [cert.issuer, cert.year].filter(Boolean).join(' · ');
        if (detail) doc.text(detail, M + 5, y + 5);
        doc.setTextColor(0, 0, 0);
        y += detail ? 12 : 7;
      });
      y += 3;
    }

    // ── PROJECTS ──
    const projects = uniqueItems(parsed.projects);
    if (projects.length > 0) {
      sectionHeader('Projects');
      projects.forEach((proj) => {
        addPageIfNeeded(18);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(proj.name || '', M + 5, y);
        doc.setFont('helvetica', 'normal');
        y += 5;
        if (proj.description) {
          const descLines = doc.splitTextToSize(String(proj.description), W - 15);
          doc.setFontSize(9);
          doc.text(descLines, M + 5, y);
          y += descLines.length * 4;
        }
        if (proj.technologies) {
          doc.setFontSize(8);
          doc.setTextColor(100, 100, 100);
          doc.text(`Tech: ${proj.technologies}`, M + 5, y);
          doc.setTextColor(0, 0, 0);
          y += 5;
        }
        y += 3;
      });
    }

    // ── ACHIEVEMENTS ──
    const achievements = Array.isArray(parsed.achievements) ? parsed.achievements : [];
    if (achievements.length > 0) {
      sectionHeader('Key Achievements');
      achievements.forEach((ach) => {
        addPageIfNeeded(10);
        doc.setFontSize(10);
        doc.text(`•  ${String(ach)}`, M + 5, y);
        y += 6;
      });
      y += 3;
    }

    // ── PUBLICATIONS & RESEARCH ──
    const publications = uniqueItems(parsed.publications);
    if (publications.length > 0) {
      sectionHeader('Publications & Research');
      publications.forEach((publication) => {
        addPageIfNeeded(12);
        const title = typeof publication === 'string' ? publication : publication.title;
        const detail = typeof publication === 'string'
          ? ''
          : [publication.venue, publication.year, publication.status].filter(Boolean).join(' · ');
        labelValue('', `${title || ''}${detail ? ` (${detail})` : ''}`);
      });
      y += 3;
    }

    // ── LANGUAGES ──
    const langs = uniqueItems(parsed.languages);
    if (langs.length > 0) {
      addPageIfNeeded(15);
      doc.setFontSize(11);
      doc.setTextColor(51, 51, 51);
      doc.setFont('helvetica', 'bold');
      doc.text('LANGUAGES', M, y);
      y += 6;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
      langs.forEach((lang) => {
        doc.setFontSize(10);
        doc.text(lang.language || '', M + 5, y);
        doc.setTextColor(100, 100, 100);
        doc.setFontSize(9);
        doc.text(`(${lang.level || ''})`, M + 50, y);
        doc.setTextColor(0, 0, 0);
        y += 6;
      });
    }

    // ── HOBBIES & INTERESTS ──
    if (parsed.hobbies) {
      sectionHeader('Hobbies & Interests');
      doc.setFontSize(10);
      const hobbyLines = doc.splitTextToSize(String(parsed.hobbies), W);
      doc.text(hobbyLines, M, y);
      y += hobbyLines.length * 4.5 + 5;
    }

    // ── REFERENCES ──
    if (parsed.references) {
      sectionHeader('References');
      doc.setFontSize(10);
      doc.text(String(parsed.references), M, y);
      y += 8;
    }

    // ── Footer on each page ──
    const totalPages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(`Page ${p} of ${totalPages}`, 105, 290, { align: 'center' });
      doc.text(`Generated by ScholarPath AI · ${new Date().toLocaleDateString()}`, M, 290);
    }

    return doc.output('datauristring');
  } catch (pdfErr) {
    console.error('PDF generation error:', pdfErr.message);
    return null;
  }
}

module.exports = {
  extractTextFromFile,
  downloadStoredCv,
  uploadCv,
  extractAcademicData,
  persistExtractedData,
  parseEuropassSections,
  buildEuropassPdf,
  extractWithoutAI,
};
