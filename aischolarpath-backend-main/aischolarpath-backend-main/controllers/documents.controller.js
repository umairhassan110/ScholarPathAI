---

### 2. File Path: `controllers/documents.controller.js`
Is code ko poori tarah select karein aur apni `controllers/documents.controller.js` file ke andar paste kar dein:

```javascript
/**
 * Documents Controller — Dynamic CV Transformation + Academic Recommendation Letter Generator
 */
const { createBudget } = require('../utils/budget');
const cvService = require('../services/cv.service');
const { askAI } = require('../services/ai.service');
const { supabase } = require('../config/supabase');
const matchingService = require('../services/matching.service');
const { scrapeScholarshipsForCountry } = require('../services/scrape.service');

// CV to Europass dynamic transformer
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

    // Extract dynamic JSON payload structure directly from text parsing pipeline
    const parsed = await cvService.parseEuropassSections(cvText, budget);

    // Save extracted object models recursively to core state engine
    if (profileId && parsed) {
      try {
        await supabase.from('extracted_profile_data').insert([{
          profile_id: profileId,
          raw_extraction: parsed,
        }]);

        const updates = {};
        if (parsed.academics?.cgpa && !profile?.cgpa) updates.cgpa = parsed.academics.cgpa;
        if (parsed.full_name && !profile?.full_name) updates.full_name = parsed.full_name;
        if (parsed.academics?.field_of_study && !profile?.field_of_study) {
          updates.field_of_study = parsed.academics.field_of_study;
        }
        if (Object.keys(updates).length > 0) {
          await supabase.from('profiles').update(updates).eq('id', profileId);
        }

        if (profile?.target_country) {
          await scrapeScholarshipsForCountry(supabase, profile.target_country, null, { forceLive: false });
        }
        await matchingService.runMatchAndStore(profileId);
      } catch (dbErr) {
        console.warn('DB Sync fallback exception caught:', dbErr.message);
      }
    }

    const pdfBase64 = cvService.buildEuropassPdf(parsed);

    return res.json({
      success: true,
      message: 'CV successfully transformed to professional dynamic Europass format.',
      suggestions: parsed.suggestions || [],
      pdf_base64: pdfBase64,
      summary: parsed.summary || '',
      education: parsed.academics ? [parsed.academics] : [],
      certifications: parsed.certifications || [],
      projects: parsed.projects || [],
      skills: parsed.skills || {},
      publications: parsed.publications || [],
      references: parsed.references || 'Available upon request',
    });
  } catch (fatalErr) {
    console.error('Fatal convertCv error:', fatalErr);
    return res.status(500).json({ success: false, error: 'Conversion pipeline failure: ' + fatalErr.message });
  }
}

// 🚀 PROFESSOR-GRADE INTELLECTUAL RECOMMENDATION LETTER GENERATOR (100% DYNAMIC PATH)
async function generateLetter(req, res) {
  try {
    const file = req.file;
    let draftText = '';

    if (file) {
      try {
        draftText = await cvService.extractTextFromFile(file.buffer, file.mimetype, { maxChars: 5000 });
      } catch (e) {
        draftText = file.buffer.toString('utf-8');
      }
    } else if (typeof req.body?.draft_text === 'string') {
      draftText = req.body.draft_text.trim();
    }

    // Build adaptive default parameters that catch real fields instantly
    let studentName = 'Academic Candidate';
    let university = 'Recognized University';
    let cgpa = '3.5';
    let program = 'Selected Degree Program';

    try {
      const profileId = req.userId || req.body?.profile_id;
      if (profileId) {
        const { data: prof } = await supabase.from('profiles').select('*').eq('id', profileId).single();
        if (prof) {
          if (prof.full_name) studentName = prof.full_name;
          if (prof.cgpa) cgpa = String(prof.cgpa);
          if (prof.field_of_study) program = prof.field_of_study;
        }

        // Fetch cross-referenced data structures from previous dynamic CV extractions
        const { data: extData } = await supabase
          .from('extracted_profile_data')
          .select('raw_extraction')
          .eq('profile_id', profileId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (extData?.raw_extraction?.academics?.university) {
          university = extData.raw_extraction.academics.university;
        }
        if (extData?.raw_extraction?.academics?.degree_level && extData?.raw_extraction?.academics?.field_of_study) {
          program = `${extData.raw_extraction.academics.degree_level} in ${extData.raw_extraction.academics.field_of_study}`;
        }
      }
    } catch (e) { /* tracking state safe fallback execution */ }

    let letterPrompt = '';
    if (draftText && draftText.length > 30) {
      letterPrompt = `You are an expert Senior Professor and Academic Advisor at ${university}. Write a full, formal, professional Academic Recommendation Letter for your student ${studentName} who is applying for international graduate admissions and competitive research funding/scholarships.

The candidate provided this context from their CV and academic records:
"""
${draftText.slice(0, 3200)}
"""

Student Context Profiles:
- Name: ${studentName}
- Institution: ${university}
- Degree/Major Area: ${program}
- Performance Metric: ${cgpa} / 4.0

Instructions:
1. Elevate this into a complete, sophisticated recommendation letter format matching elite global admissions protocols (US, UK, European Union, Commonwealth).
2. Directly reference specific project items, domain architectures, tools, or research papers discovered inside the candidate's custom text profile.
3. Validate their analytical acumen, theoretical understanding, and independent lab or execution focus.
4. Give an unconditional, top-tier endorsement supporting full scholarship allocations and immediate enrollment.
5. Finish with a structured Professor Signature and Faculty Designation block.

Return ONLY the complete letter text. Do not wrap in markdown code blocks or add pre-emptive conversational chat introduction lines.`;
    } else {
      letterPrompt = `You are a Senior Professor and Department Chair at ${university}. Write an exhaustive, outstanding official Academic Recommendation Letter for your undergraduate student ${studentName} to support global Master's or PhD program admissions and financial fellowships.

Candidate Specific Metrics:
- Full Name: ${studentName}
- Origin University: ${university}
- Field Track: ${program}
- Core GPA: ${cgpa} / 4.0

Format Rules:
- Formal institutional greeting structure (e.g., To the Admissions and Scholarship Selection Committee)
- Clear introduction describing the professor's structural rank and evaluation depth with the candidate
- Comprehensive section detailing classroom distinction, logical focus, and exam performance benchmarks
- Dedicated analysis of practical applied project capabilities, domain skill execution blocks, and research orientation
- Paragraph highlighting strong collaborative work ethic, personal high integrity, and adaptive capability
- Uncompromising final validation recommending them for full graduate study permissions and financial grants
- Standard official Professor Signature, Designation Title & Institutional Block

Return ONLY the final polished text structure of the recommendation letter.`;
    }

    const letterText = await askAI(letterPrompt, { domain: 'chatbot' });
    return res.json({ success: true, message: 'High-Impact Letter generated successfully.', letter_text: letterText });
  } catch (err) {
    console.error('generateLetter error:', err);
    return res.status(500).json({ success: false, error: 'Could not generate dynamic recommendation letter: ' + err.message });
  }
}

module.exports = { convertCv, generateLetter };
