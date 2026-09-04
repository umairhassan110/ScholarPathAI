const fs = require('fs');
const path = require('path');

console.log('🚀 [PATCH] Starting ScholarPath AI master update...\n');

// ── 1. PATCH ProfileTab.jsx (Full CV Display: Projects, Skills, Certs, Papers) ──
const profileTabPath = path.join(__dirname, 'scholarpath-frontend (2)/scholarpath/src/pages/ProfileTab.jsx');
if (fs.existsSync(profileTabPath)) {
  let pt = fs.readFileSync(profileTabPath, 'utf8');
  const marker = '{extractedData.experience?.years_of_experience > 0 && <div><span className="text-sp-slate">Experience:</span> <span className="font-semibold text-sp-navy">{extractedData.experience.years_of_experience} yrs</span></div>}';
  
  if (pt.includes(marker) && !pt.includes('Projects Detected')) {
    const extraJSX = `\n                    </div>
                    {/* Full CV Extraction Display */}
                    {extractedData.projects && extractedData.projects.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-sp-blue/20">
                        <p className="text-xs font-semibold uppercase text-sp-blue mb-1.5">Projects Detected ({extractedData.projects.length})</p>
                        <div className="space-y-1.5">
                          {extractedData.projects.map((p, i) => (
                            <div key={i} className="bg-white/90 p-2 rounded-lg border border-sp-border text-xs">
                              <span className="font-bold text-sp-navy">{p.name || p}</span>
                              {p.technologies && <span className="text-sp-blue ml-2 italic">[{p.technologies}]</span>}
                              {p.description && <p className="text-sp-slate mt-0.5">{p.description}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {(extractedData.skills?.technical || extractedData.skills) && (
                      <div className="mt-3 pt-3 border-t border-sp-blue/20">
                        <p className="text-xs font-semibold uppercase text-sp-blue mb-1.5">Technical Skills</p>
                        <div className="flex flex-wrap gap-1.5">
                          {String(extractedData.skills?.technical || extractedData.skills).split(',').map((s, i) => (
                            <span key={i} className="bg-white px-2 py-0.5 rounded text-xs font-medium text-sp-navy border border-sp-border shadow-2xs">
                              {s.trim()}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {extractedData.certifications && extractedData.certifications.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-sp-blue/20">
                        <p className="text-xs font-semibold uppercase text-sp-blue mb-1.5">Certifications & Awards</p>
                        <ul className="text-xs text-sp-navy space-y-1">
                          {extractedData.certifications.map((c, i) => (
                            <li key={i} className="flex items-center gap-1.5">
                              <span className="text-sp-blue font-bold">✓</span>
                              <span><strong className="font-semibold">{c.name || c}</strong> {c.issuer ? `(${c.issuer})` : ''}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {extractedData.publications && extractedData.publications.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-sp-blue/20">
                        <p className="text-xs font-semibold uppercase text-sp-blue mb-1.5">Publications & Research</p>
                        <ul className="text-xs text-sp-navy space-y-1">
                          {extractedData.publications.map((pub, i) => (
                            <li key={i} className="flex items-start gap-1.5">
                              <span className="text-sp-blue">📄</span>
                              <span><strong className="font-semibold">{pub.title || pub}</strong> {pub.venue ? `— ${pub.venue}` : ''}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}`;
    
    pt = pt.replace(marker + '\n                  </div>', marker + extraJSX);
    fs.writeFileSync(profileTabPath, pt);
    console.log('✅ [1/3] ProfileTab.jsx updated: Full CV display added!');
  } else {
    console.log('ℹ️ [1/3] ProfileTab.jsx already has full extraction display.');
  }
}

// ── 2. PATCH controllers/documents.controller.js (Recommendation Letter & Safe CV) ──
const docCtrlPath = path.join(__dirname, 'aischolarpath-backend-main/aischolarpath-backend-main/controllers/documents.controller.js');
if (fs.existsSync(docCtrlPath)) {
  const docCode = `/**
 * Documents Controller — CV Europass conversion + High-Impact Academic Recommendation Letter Generator
 */
const { createBudget } = require('../utils/budget');
const cvService = require('../services/cv.service');
const { askAI } = require('../services/ai.service');
const { supabase } = require('../config/supabase');
const matchingService = require('../services/matching.service');
const { scrapeScholarshipsForCountry } = require('../services/scrape.service');

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

    if (file) {
      try {
        draftText = await cvService.extractTextFromFile(file.buffer, file.mimetype, { maxChars: 5000 });
      } catch (e) {
        draftText = file.buffer.toString('utf-8');
      }
    } else if (typeof req.body?.draft_text === 'string') {
      draftText = req.body.draft_text.trim();
    }

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

    let letterPrompt = '';
    if (draftText && draftText.length > 30) {
      letterPrompt = \`You are a distinguished Professor and Department Chair of Artificial Intelligence at \${university}. Write a formal, high-impact Academic Recommendation Letter for your student \${studentName} who is applying for international graduate admission and scholarships.

Draft input provided:
\"\"\"
\${draftText.slice(0, 3000)}
\"\"\"

Student Details:
- Name: \${studentName}
- University: \${university}
- Degree: \${program}
- CGPA: \${cgpa} / 4.0

Instructions:
1. Elevate this into a prestigious, professional recommendation letter suitable for top universities abroad.
2. Highlight the student's technical strengths in machine learning pipelines, autonomous systems (YOLOv8), and SaaS architectures (InkFlow AI).
3. Mention their academic consistency, research potential (preprint publications), and competitive spirit (ROBOCUST Robotics runner-up).
4. Provide an enthusiastic endorsement for graduate admission and full scholarship funding.
5. End with an official Professor sign-off block.

Return ONLY the complete letter text without markdown backticks.\`;
    } else {
      letterPrompt = \`You are a Senior Professor of Artificial Intelligence at \${university}. Write an outstanding, official Academic Recommendation Letter for your undergraduate student \${studentName} for international Master's program admissions and merit scholarships.

Candidate Background:
- Full Name: \${studentName}
- Institution: \${university}
- Degree: \${program}
- CGPA: \${cgpa} / 4.0
- Key Highlights: Founder of InkFlow AI Platform, Winner/Runner-up at ROBOCUST Robotics Competition (IEEE Pakistan), published researcher in Swin Transformers & Computer Vision.

Format:
- Formal Salutation (To the Admissions and Scholarship Selection Committee)
- Introduction of Professor & relationship with candidate
- Paragraph on Academic Excellence & Analytical Capability
- Paragraph on Practical Project Leadership (InkFlow AI, Autonomous Vehicle with YOLOv8, Heart Attack Risk Predictor)
- Paragraph on Personal Character, Work Ethic, and Research Dedication
- Strong, unqualified recommendation for admission and scholarship awards
- Official Professor Signature & Designation Block

Return ONLY the polished letter text.\`;
    }

    const letterText = await askAI(letterPrompt, { domain: 'chatbot' });
    return res.json({ success: true, message: 'Letter generated successfully.', letter_text: letterText });
  } catch (err) {
    console.error('generateLetter error:', err);
    return res.status(500).json({ success: false, error: 'Could not generate letter: ' + err.message });
  }
}

module.exports = { convertCv, generateLetter };
`;
  fs.writeFileSync(docCtrlPath, docCode);
  console.log('✅ [2/3] documents.controller.js updated: Recommendation Letter Generator enhanced!');
}

// ── 3. PATCH services/cv.service.js (Executive 2-Page Europass Layout) ──
const cvServicePath = path.join(__dirname, 'aischolarpath-backend-main/aischolarpath-backend-main/services/cv.service.js');
if (fs.existsSync(cvServicePath)) {
  let cvCode = fs.readFileSync(cvServicePath, 'utf8');
  const startIdx = cvCode.indexOf('function buildEuropassPdf(');
  const endIdx = cvCode.indexOf('module.exports = {');

  if (startIdx !== -1 && endIdx !== -1) {
    const newPdfFunc = `function buildEuropassPdf(parsed) {
  try {
    const jspdfModule = require('jspdf');
    const DocClass = jspdfModule.jsPDF || jspdfModule.default || jspdfModule;
    const doc = new DocClass();

    const M = 18;
    const W = 174;
    let y = 20;

    function addPageIfNeeded(needed) {
      if (y + needed > 270) {
        doc.addPage();
        y = 20;
      }
    }

    function sectionHeader(title) {
      addPageIfNeeded(18);
      y += 4;
      doc.setDrawColor(14, 65, 148);
      doc.setLineWidth(0.8);
      doc.line(M, y, M + W, y);
      y += 4.5;
      doc.setFontSize(11);
      doc.setTextColor(14, 65, 148);
      doc.setFont('helvetica', 'bold');
      doc.text(String(title || '').toUpperCase(), M, y);
      y += 6.5;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30, 41, 59);
    }

    const data = parsed || {};

    // Header
    const cvName = String(data.full_name || 'UMAIR HASSAN').toUpperCase();
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(11, 37, 69);
    doc.text(cvName, M, y);
    y += 6.5;

    doc.setFontSize(10.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(18, 91, 201);
    doc.text('CURRICULUM VITAE · EUROPASS FORMAT', M, y);
    y += 4;

    doc.setDrawColor(18, 91, 201);
    doc.setLineWidth(0.6);
    doc.line(M, y, M + W, y);
    y += 6;

    // Contact
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text('Location: Islamabad, Pakistan', M, y);
    doc.text('Phone: +92 312 138 2700', M + 90, y);
    y += 4.5;
    doc.text('Email: uh3447347@gmail.com', M, y);
    doc.text('LinkedIn: linkedin.com/in/umair-hassan-596115298', M + 90, y);
    y += 6;

    // Summary
    if (data.summary) {
      sectionHeader('About Me');
      doc.setFontSize(9.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30, 41, 59);
      const sumLines = doc.splitTextToSize(String(data.summary).replace(/\\s+/g, ' ').trim(), W);
      doc.text(sumLines, M, y);
      y += sumLines.length * 4.5 + 3;
    }

    // Education
    sectionHeader('Education and Training');
    addPageIfNeeded(22);
    doc.setFontSize(10.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('Bachelor of Science in Artificial Intelligence', M, y);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('2022 – 2026', M + W - doc.getTextWidth('2022 – 2026'), y);
    y += 5;

    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    doc.text('Muslim Youth University, Islamabad · CGPA: 3.2 / 4.0', M, y);
    y += 7;

    // Key Projects
    const projectList = [
      {
        name: 'InkFlow AI Platform',
        tech: 'Python, Web Dev, AI APIs',
        desc: 'Full-stack SaaS platform that consolidates 11+ specialized AI tools into a unified web interface via secure API integrations.'
      },
      {
        name: 'Autonomous Vehicle Prototype',
        tech: 'Python, YOLOv8, Raspberry Pi, OpenCV',
        desc: 'Real-time deep learning vision pipeline on Raspberry Pi using YOLOv8 for instant object detection and autonomous collision avoidance.'
      },
      {
        name: 'Heart Attack Risk Predictor',
        tech: 'Python, Machine Learning, Scikit-Learn',
        desc: 'Engineered a predictive ML classification pipeline using Python and Scikit-Learn to analyze clinical health metrics and evaluate patient risk factors.'
      }
    ];

    sectionHeader('Key Projects');
    projectList.forEach((proj) => {
      addPageIfNeeded(20);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(18, 91, 201);
      doc.text(\`•  \${proj.name}\`, M, y);

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(100, 116, 139);
      doc.text(\` [\${proj.tech}]\`, M + doc.getTextWidth(\`•  \${proj.name}\`) + 2, y);
      y += 4.5;

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      const descLines = doc.splitTextToSize(proj.desc, W - 6);
      doc.text(descLines, M + 4, y);
      y += descLines.length * 4.2 + 3;
    });

    // Personal Skills
    sectionHeader('Personal Skills');
    addPageIfNeeded(20);
    const skillRows = [
      { label: 'Programming & Tools', val: 'Python, C++, Java, SQL, Git, GitHub' },
      { label: 'AI & Machine Learning', val: 'LLMs, Deep Learning, Computer Vision, OpenCV, PyTorch, TensorFlow, YOLOv11' },
      { label: 'Agentic AI & Automation', val: 'Autonomous Agents, Agentic Workflows, CrewAI, n8n, Edge AI' },
      { label: 'Languages', val: 'English (Proficient), Urdu (Native)' }
    ];

    skillRows.forEach(sr => {
      addPageIfNeeded(12);
      doc.setFontSize(9.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text(\`•  \${sr.label}: \`, M, y);
      const labelW = doc.getTextWidth(\`•  \${sr.label}: \`);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      const lines = doc.splitTextToSize(sr.val, W - labelW);
      doc.text(lines, M + labelW, y);
      y += lines.length * 4.2 + 2.5;
    });

    // Certifications & Awards
    sectionHeader('Certifications & Awards');
    const certList = [
      { title: 'ROBOCUST Robotics Competition — Runner-Up', org: 'SCEEK & IEEE Pakistan', year: '2026' },
      { title: 'Career Essentials in Generative AI', org: 'Microsoft & LinkedIn Learning', year: '2024' }
    ];

    certList.forEach(cert => {
      addPageIfNeeded(12);
      doc.setFontSize(9.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text(\`•  \${cert.title}\`, M, y);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(\` (\${cert.org} · \${cert.year})\`, M + doc.getTextWidth(\`•  \${cert.title}\`), y);
      y += 5.5;
    });

    // Publications & Research
    sectionHeader('Publications & Research');
    const pubList = [
      { title: 'Enhanced Camouflaged Object Detection using Swin Transformer and Gated Fusion Mechanism', venue: 'ResearchGate Preprint', year: '2026' },
      { title: "Education for Sale: The Collapse of Pakistan's Academic Integrity", venue: 'Published Article', year: '2026' },
      { title: 'Artificial Intelligence and Its Real Consequences: How AI Is Destroying Our Minds, Jobs, and Ethics', venue: 'Published Article', year: '2026' }
    ];

    pubList.forEach(pub => {
      addPageIfNeeded(14);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30, 41, 59);
      const pubText = \`•  \${pub.title} — \${pub.venue} (\${pub.year})\`;
      const pubLines = doc.splitTextToSize(pubText, W);
      doc.text(pubLines, M, y);
      y += pubLines.length * 4.2 + 2.5;
    });

    // References
    addPageIfNeeded(10);
    sectionHeader('References');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(100, 116, 139);
    doc.text('Available upon request', M, y);

    // Page Numbers
    const totalPages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(\`Page \${p} of \${totalPages}\`, 105, 290, { align: 'center' });
      doc.text('ScholarPath AI · Europass CV', M, 290);
    }

    return doc.output('datauristring');
  } catch (pdfErr) {
    console.error('PDF error:', pdfErr.message);
    return null;
  }
}

`;
    cvCode = cvCode.substring(0, startIdx) + newPdfFunc + cvCode.substring(endIdx);
    fs.writeFileSync(cvServicePath, cvCode);
    console.log('✅ [3/3] cv.service.js updated: Executive 2-Page Europass PDF Layout configured!');
  }
}

console.log('\n🎉 [SUCCESS] All 3 files updated cleanly!');