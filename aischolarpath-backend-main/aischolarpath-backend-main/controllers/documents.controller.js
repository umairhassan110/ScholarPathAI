/**
 * Documents Controller — CV Europass conversion + Recommendation letters
 */
const { createBudget } = require('../utils/budget');
const cvService = require('../services/cv.service');
const { askAI } = require('../services/ai.service');
const { supabase } = require('../config/supabase');
const matchingService = require('../services/matching.service');
const { scrapeScholarshipsForCountry } = require('../services/scrape.service');

// CV to Europass converter - REAL profile data + AI-structured + full PDF
async function convertCv(req, res) {
  const budget = createBudget();
  const profileId = req.body?.profile_id || req.userId;

  let profile = null;
  try {
    const { data } = await supabase.from('profiles').select('*').eq('id', profileId).single();
    profile = data;
  } catch (e) {
    console.error('Profile fetch failed:', e.message);
  }

  let cvText = '';
  const file = req.file;
  if (file) {
    cvText = await cvService.extractTextFromFile(file.buffer, file.mimetype, { maxChars: 6000 });
  } else if (profile?.cv_file_path) {
    const stored = await cvService.downloadStoredCv(profileId);
    if (stored) {
      cvText = await cvService.extractTextFromFile(stored.buffer, stored.mimeType, { maxChars: 6000 });
    }
  }

  const parsed = await cvService.parseEuropassSections(cvText, budget);

  // 🚀 SAVE EXTRACTED DATA TO DATABASE!
  if (profileId && parsed) {
    try {
      console.log('💾 [CV PERSIST] Saving extracted CV data to database...');
      await supabase.from('extracted_profile_data').insert([{
        profile_id: profileId,
        raw_extraction: parsed,
      }]);

      const updates = {};
      if (parsed.education?.[0]?.cgpa && !profile?.cgpa) updates.cgpa = parsed.education[0].cgpa;
      if (parsed.full_name && !profile?.full_name) updates.full_name = parsed.full_name;
      if (parsed.field_of_study && !profile?.field_of_study) updates.field_of_study = parsed.field_of_study;
      if (Object.keys(updates).length > 0) {
        await supabase.from('profiles').update(updates).eq('id', profileId);
      }

      if (profile?.target_country) {
        await scrapeScholarshipsForCountry(supabase, profile.target_country, null, { forceLive: true });
      }
      await matchingService.runMatchAndStore(profileId);
      console.log('✅ [CV PERSIST] Saved to database and matches computed!');
    } catch (dbErr) {
      console.warn('DB Persist warning:', dbErr.message);
    }
  }

  const pdfBase64 = cvService.buildEuropassPdf(parsed);

  res.json({
    success: true,
    message: 'CV converted to Europass format.',
    suggestions: parsed.suggestions || [],
    pdf_base64: pdfBase64,
    summary: parsed.summary || '',
    work_experience: parsed.work_experience || [],
    education: parsed.education || [],
    certifications: parsed.certifications || [],
    projects: parsed.projects || [],
    achievements: parsed.achievements || [],
    skills: parsed.skills || {},
    languages: parsed.languages || [],
    hobbies: parsed.hobbies || '',
    references: parsed.references || '',
  });
}

// Recommendation letter generator
async function generateLetter(req, res) {
  const file = req.file;
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

  const letterPrompt = `You are an expert academic recommendation letter writer. ${
    draftText
      ? `Here is a draft recommendation letter:\n"${draftText.slice(0, 2000)}"\n\nPolish and improve this letter.`
      : 'Generate a professional academic recommendation letter template for a student applying to a Master\'s program abroad.'
  } Write a polished, professional recommendation letter (about 200-300 words). Return ONLY the letter text, no JSON, no markdown.`;

  const letterText = await askAI(letterPrompt, { domain: 'chatbot' });
  res.json({ success: true, message: 'Letter generated.', letter_text: letterText });
}

module.exports = { convertCv, generateLetter };