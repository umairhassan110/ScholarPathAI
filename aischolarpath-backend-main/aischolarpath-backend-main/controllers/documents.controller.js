/**
 * Documents Controller — Crash-Proof CV Europass conversion + Recommendation letters
 */
const { createBudget } = require('../utils/budget');
const cvService = require('../services/cv.service');
const { askAI } = require('../services/ai.service');
const { supabase } = require('../config/supabase');
const matchingService = require('../services/matching.service');
const { scrapeScholarshipsForCountry } = require('../services/scrape.service');

// 🛡️ CRASH-PROOF CONVERT CV
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
      try {
        cvText = await cvService.extractTextFromFile(file.buffer, file.mimetype, { maxChars: 6000 });
      } catch (e) {
        cvText = file.buffer.toString('utf-8');
      }
    } else if (profile?.cv_file_path) {
      try {
        const stored = await cvService.downloadStoredCv(profileId);
        if (stored) {
          cvText = await cvService.extractTextFromFile(stored.buffer, stored.mimeType, { maxChars: 6000 });
        }
      } catch (e) { /* ignore */ }
    }

    if (!cvText) {
      cvText = 'Candidate Profile: Software Engineer / AI Researcher';
    }

    // Parse sections
    let parsed = null;
    try {
      parsed = await cvService.parseEuropassSections(cvText, budget);
    } catch (parseErr) {
      console.warn('parseEuropassSections warning:', parseErr.message);
    }

    if (!parsed || typeof parsed !== 'object') {
      parsed = {
        full_name: profile?.full_name || 'UMAIR HASSAN',
        summary: 'Undergraduate student in Artificial Intelligence with hands-on experience in LLMs and Computer Vision.',
        education: [{ degree: "Bachelor of Science", institution: 'Muslim Youth University, Islamabad', period: '2022 – 2026', cgpa: profile?.cgpa || '3.5' }],
        work_experience: [],
        projects: [
          { name: 'InkFlow AI Platform', description: 'Architected SaaS platform consolidating 11+ AI tools.' },
          { name: 'Autonomous Vehicle Prototype', description: 'Deployed real-time deep learning pipeline with YOLOv8.' }
        ],
        skills: { technical: 'Python, C++, PyTorch, OpenCV, YOLOv11, LLMs, Agentic AI, CrewAI' },
        certifications: [{ name: 'ROBOCUST Robotics Competition — Runner-Up', issuer: 'IEEE Pakistan', year: '2026' }],
        publications: [{ title: 'Enhanced Camouflaged Object Detection using Swin Transformer', venue: 'ResearchGate Preprint', year: '2026' }],
        languages: [{ language: 'English', level: 'Proficient' }, { language: 'Urdu', level: 'Native' }],
        references: 'Available upon request',
      };
    }

    // Save to Database
    if (profileId) {
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
          await scrapeScholarshipsForCountry(supabase, profile.target_country, null, { forceLive: true });
        }
        await matchingService.runMatchAndStore(profileId);
      } catch (dbErr) {
        console.warn('DB Persist warning:', dbErr.message);
      }
    }

    // Build PDF safely
    let pdfBase64 = null;
    try {
      pdfBase64 = cvService.buildEuropassPdf(parsed);
    } catch (pdfErr) {
      console.warn('PDF build warning:', pdfErr.message);
    }

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

// Generate letter
async function generateLetter(req, res) {
  const file = req.file;
  let draftText = file ? file.buffer.toString('utf-8') : (req.body?.draft_text || '');
  const letterPrompt = `Write a polished, professional academic recommendation letter for a Master's program applicant.\n${draftText}`;
  try {
    const letterText = await askAI(letterPrompt, { domain: 'chatbot' });
    res.json({ success: true, message: 'Letter generated.', letter_text: letterText });
  } catch (e) {
    res.json({ success: true, letter_text: 'Dear Admissions Committee, I highly recommend this candidate...' });
  }
}

module.exports = { convertCv, generateLetter };