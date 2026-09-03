/**
 * Documents Controller — CV Europass conversion + recommendation letters
 *
 * Heavy logic (parsing, AI, PDF rendering) lives in cv.service with a
 * deadline budget; this controller only handles HTTP concerns.
 */
const { createBudget } = require('../utils/budget');
const cvService = require('../services/cv.service');
const { askAI } = require('../services/ai.service');

// CV to Europass converter - REAL profile data + AI-structured + full PDF
async function convertCv(req, res) {
  const budget = createBudget();
  const profileId = req.userId;
  const { supabase } = require('../config/supabase');

  // Fetch profile data from DB
  let profile = null;
  try {
    const { data } = await supabase.from('profiles').select('*').eq('id', profileId).single();
    profile = data;
  } catch (e) { console.error('Profile fetch failed:', e.message); }

  // Get CV text from uploaded file OR Supabase storage
  let cvText = '';
  const file = req.file;

  if (file) {
    cvText = await cvService.extractTextFromFile(file.buffer, file.mimetype, { maxChars: 6000 });
    if (profileId && cvText && !cvText.startsWith('[')) {
      await cvService.uploadCv(profileId, file.buffer, file.mimetype, file.originalname);
    }
  } else if (profile?.cv_file_path) {
    // Download from storage
    const stored = await cvService.downloadStoredCv(profileId);
    if (stored) {
      cvText = await cvService.extractTextFromFile(stored.buffer, stored.mimeType, { maxChars: 6000 });
    }
  }

  const [extracted, parsed] = await Promise.all([
    cvService.extractAcademicData(cvText, budget),
    cvService.parseEuropassSections(cvText, budget),
  ]);
  if (profileId && cvText && !cvText.startsWith('[')) {
    await cvService.persistExtractedData(profileId, extracted);
  }

  // Build proper Europass PDF
  const pdfBase64 = cvService.buildEuropassPdf(parsed);

  res.json({
    success: true,
    message: 'CV converted to Europass format.',
    extracted,
    suggestions: parsed.suggestions || [],
    pdf_base64: pdfBase64,
    summary: parsed.summary || '',
    work_experience: parsed.work_experience || [],
    education: parsed.education || [],
    certifications: parsed.certifications || [],
    projects: parsed.projects || [],
    publications: parsed.publications || [],
    achievements: parsed.achievements || [],
    skills: parsed.skills || {},
    languages: parsed.languages || [],
    hobbies: parsed.hobbies || '',
    references: parsed.references || '',
  });
}

// Recommendation letter generator - AI Agent polishes/generates letters
async function generateLetter(req, res) {
  const file = req.file;

  // Accept EITHER an uploaded draft file OR pasted draft text via
  // req.body.draft_text. Neither is required: an empty request generates a
  // fresh letter from scratch (handled by the prompt's else-branch below).
  let draftText = '';
  if (file) {
    if (file.mimetype === 'text/plain') {
      draftText = file.buffer.toString('utf-8');
    } else {
      draftText = `[Uploaded file: ${file.originalname}]`;
    }
  } else if (typeof req.body?.draft_text === 'string') {
    draftText = req.body.draft_text;
  }

  const letterPrompt = `You are an expert academic recommendation letter writer.
${draftText
    ? `Here is a draft recommendation letter:\n"${draftText.slice(0, 2000)}"\n\nPolish and improve this letter. Make it more professional, add stronger language about the candidate's abilities, and ensure a compelling closing.`
    : 'Generate a professional academic recommendation letter template for a student applying to a Master\'s program abroad.'}

Write a polished, professional recommendation letter (about 200-300 words). Return ONLY the letter text, no JSON, no markdown.`;

  const letterText = await askAI(letterPrompt, { domain: 'chatbot' });

  res.json({
    success: true,
    message: 'Letter generated.',
    letter_text: letterText
  });
}

module.exports = { convertCv, generateLetter };
