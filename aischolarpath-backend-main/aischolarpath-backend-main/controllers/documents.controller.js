/**
 * Documents Controller — CV Europass conversion + High-Impact Academic Recommendation Letter Generator
 */
const { createBudget } = require('../utils/budget');
const cvService = require('../services/cv.service');
const { askAI } = require('../services/ai.service');
const { supabase } = require('../config/supabase');
const matchingService = require('../services/matching.service');
const { scrapeScholarshipsForCountry } = require('../services/scrape.service');

// CV to Europass converter
async function convertCv(req, res) {
  const budget = createBudget();
  const profileId = req.body?.profile_id || req.userId;

  try {
    let profile = null;
    if (profileId) {
      try {
        const { data } = await supabase.from('profiles').select('*').eq('id', profileId).single();
        profile = data;
      } catch (e) { /* ignore */ }
    }

    let cvText = '';
    const file = req.file;
    if (file) {
      cvText = await cvService.extractTextFromFile(file.buffer, file.mimetype, { maxChars: 8000 });
    } else if (profile?.cv_file_path) {
      const stored = await cvService.downloadStoredCv(profileId);
      if (stored) {
        cvText = await cvService.extractTextFromFile(stored.buffer, stored.mimeType, { maxChars: 8000 });
      }
    }

    if (!cvText) {
      cvText = 'Candidate Profile: Software Engineer / AI Researcher';
    }

    const parsed = await cvService.parseEuropassSections(cvText, budget);

    // Save to Database
    if (profileId && parsed) {
      try {
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
          await scrapeScholarshipsForCountry(supabase, profile.target_country, null, { forceLive: false });
        }
        await matchingService.runMatchAndStore(profileId);
      } catch (dbErr) {
        console.warn('DB Persist warning:', dbErr.message);
      }
    }

    const pdfBase64 = cvService.buildEuropassPdf(parsed);

    return res.json({
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
  } catch (fatalErr) {
    console.error('Fatal convertCv error:', fatalErr);
    return res.status(500).json({ success: false, error: 'Conversion error: ' + fatalErr.message });
  }
}

// 🚀 PROFESSOR-GRADE RECOMMENDATION LETTER GENERATOR
async function generateLetter(req, res) {
  try {
    const file = req.file;
    let draftText = '';

    // Extract text from uploaded PDF or Word document
    if (file) {
      try {
        draftText = await cvService.extractTextFromFile(file.buffer, file.mimetype, { maxChars: 5000 });
      } catch (e) {
        draftText = file.buffer.toString('utf-8');
      }
    } else if (typeof req.body?.draft_text === 'string') {
      draftText = req.body.draft_text.trim();
    }

    // Student Information for personalized letter
    let studentName = 'Umair Hassan';
    let university = 'Muslim Youth University, Islamabad';
    let cgpa = '3.2';
    let program = 'Bachelor of Science in Artificial Intelligence';

    try {
      const profileId = req.userId || req.body?.profile_id;
      if (profileId) {
        const { data: prof } = await supabase.from('profiles').select('*').eq('id', profileId).single();
        if (prof?.full_name) studentName = prof.full_name;
        if (prof?.cgpa) cgpa = String(prof.cgpa);
      }
    } catch (e) { /* ignore */ }

    // Prompt for Groq AI
    let letterPrompt = '';
    if (draftText && draftText.length > 30) {
      letterPrompt = `You are a distinguished Professor and Department Chair of Artificial Intelligence at ${university}. Write a formal, high-impact Academic Recommendation Letter for your student ${studentName} who is applying for international graduate admission and scholarships.

The student provided this draft/notes:
"""
${draftText.slice(0, 3000)}
"""

Student Details:
- Name: ${studentName}
- University: ${university}
- Degree: ${program}
- CGPA: ${cgpa} / 4.0

Instructions:
1. Elevate this into a prestigious, professional recommendation letter suitable for top universities abroad (e.g. US, UK, Germany, Japan).
2. Highlight the student's technical strengths in machine learning pipelines, autonomous systems (YOLOv8), and SaaS architectures (InkFlow AI).
3. Mention their academic consistency, research potential (preprint publications), and competitive spirit (ROBOCUST Robotics runner-up).
4. Provide an enthusiastic endorsement for graduate admission and full scholarship funding.
5. End with an official Professor sign-off block.

Return ONLY the complete letter text. Do not wrap in markdown backticks or include conversational chat text.`;
    } else {
      letterPrompt = `You are a Senior Professor of Artificial Intelligence at ${university}. Write an outstanding, official Academic Recommendation Letter for your undergraduate student ${studentName} for international Master's program admissions and merit scholarships.

Candidate Background:
- Full Name: ${studentName}
- Institution: ${university}
- Degree: ${program}
- CGPA: ${cgpa} / 4.0
- Key Highlights: Founder of InkFlow AI Platform, Winner/Runner-up at ROBOCUST Robotics Competition (IEEE Pakistan), published researcher in Swin Transformers & Computer Vision.

Format:
- Formal Salutation (To the Admissions and Scholarship Selection Committee)
- Introduction of Professor & relationship with candidate
- Paragraph on Academic Excellence & Analytical Capability
- Paragraph on Practical Project Leadership (InkFlow AI, Autonomous Vehicle with YOLOv8, Heart Attack Risk Predictor)
- Paragraph on Personal Character, Work Ethic, and Research Dedication
- Strong, unqualified recommendation for admission and scholarship awards
- Official Professor Signature & Designation Block

Return ONLY the polished letter text.`;
    }

    const letterText = await askAI(letterPrompt, { domain: 'chatbot' });
    return res.json({ success: true, message: 'Letter generated successfully.', letter_text: letterText });
  } catch (err) {
    console.error('generateLetter error:', err);
    return res.status(500).json({ success: false, error: 'Could not generate letter: ' + err.message });
  }
}

module.exports = { convertCv, generateLetter };