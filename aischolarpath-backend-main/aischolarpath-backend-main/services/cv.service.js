/**
 * CV Service — 100% Dynamic Real-Time Extraction + Monochrome Professional PDF Builder
 * Zero hardcoded data. 100% dynamic from uploaded CV. No blue color styling.
 */
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const { askAI } = require('./ai.service');
const { supabase } = require('../config/supabase');

// 1. Extract text from uploaded PDF or Word document
async function extractTextFromFile(buffer, mimeType, options = {}) {
  if (!buffer) return '';
  const maxChars = options.maxChars || 15000;

  try {
    if (mimeType === 'application/pdf' || buffer.slice(0, 4).toString() === '%PDF') {
      const data = await pdf(buffer);
      return (data.text || '').replace(/\s+/g, ' ').trim().slice(0, maxChars);
    } else if (mimeType && mimeType.includes('word')) {
      const result = await mammoth.extractRawText({ buffer });
      return (result.value || '').replace(/\s+/g, ' ').trim().slice(0, maxChars);
    } else {
      return buffer.toString('utf-8').replace(/\s+/g, ' ').trim().slice(0, maxChars);
    }
  } catch (err) {
    console.error('File text extraction error:', err.message);
    return buffer.toString('utf-8').replace(/\s+/g, ' ').trim().slice(0, maxChars);
  }
}

// 2. Download stored CV from Supabase
async function downloadStoredCv(profileId) {
  try {
    const { data: prof } = await supabase.from('profiles').select('cv_file_path').eq('id', profileId).single();
    if (!prof || !prof.cv_file_path) return null;
    const { data, error } = await supabase.storage.from('cvs').download(prof.cv_file_path);
    if (error || !data) return null;
    const arrayBuffer = await data.arrayBuffer();
    return { buffer: Buffer.from(arrayBuffer), mimeType: data.type || 'application/pdf' };
  } catch (e) {
    return null;
  }
}

// 3. Upload CV to Supabase storage
async function uploadCv(profileId, buffer, mimeType, originalName) {
  const filePath = `${profileId}/${Date.now()}_${originalName || 'cv.pdf'}`;
  try {
    await supabase.storage.from('cvs').upload(filePath, buffer, { contentType: mimeType, upsert: true });
    await supabase.from('profiles').update({ cv_file_path: filePath }).eq('id', profileId);
    return filePath;
  } catch (e) {
    return 'local_buffer';
  }
}

// 4. 🚀 100% DYNAMIC REAL-TIME AI EXTRACTION (ZERO HARDCODING)
async function extractAcademicData(cvText, budget) {
  const prompt = `You are an expert CV and resume parser.
Extract ALL information accurately from this CV text into a valid JSON object.
Extract the candidate's exact full name, headline/title, email, phone, location/address, LinkedIn, summary, work experience, education, projects, skills, certifications, publications, and languages directly from the text.

CV TEXT:
${cvText}

Return ONLY valid JSON (no markdown backticks):
{
  "full_name": "Full Name from CV",
  "headline": "Job Title / Role / Profession from CV (e.g. Broadcast Journalist, Software Engineer, Student)",
  "email": "Email address from CV",
  "phone": "Phone number from CV",
  "address": "Location / City from CV",
  "linkedin": "LinkedIn link or username or null",
  "summary": "About me or professional executive summary directly from CV",
  "work_experience": [
    { "role": "Job Title", "employer": "Company / Organization", "city": "Location", "period": "Duration", "description": "Responsibilities and achievements" }
  ],
  "education": [
    { "degree": "Degree name", "institution": "University / College", "period": "Years", "cgpa": "CGPA if mentioned", "description": "Details" }
  ],
  "projects": [
    { "name": "Project Name", "tech": "Tools used", "description": "Description" }
  ],
  "skills": {
    "technical": "Core technical skills from CV",
    "soft": "Professional / communication skills from CV"
  },
  "certifications": [
    { "name": "Certification title", "issuer": "Organization", "year": "Year" }
  ],
  "publications": [
    { "title": "Article or Paper title", "venue": "Publisher / Media", "year": "Year" }
  ],
  "languages": [
    { "language": "Language", "level": "Proficiency" }
  ],
  "references": "References or Available upon request"
}`;

  let parsed = null;
  try {
    parsed = await askAI(prompt, { domain: 'cvExtractor', jsonMode: true });
  } catch (err) {
    console.warn('AI CV Extraction error:', err.message);
  }

  // 100% Dynamic Fallback (Extracts directly from text, NO hardcoded names or projects!)
  if (!parsed || typeof parsed !== 'object') {
    const emailMatch = cvText.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
    const phoneMatch = cvText.match(/(\+?\d{1,3}[-.\s]?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4})/);
    const lines = cvText.split('\n').map(l => l.trim()).filter(Boolean);

    parsed = {
      full_name: lines[0] || 'Candidate Name',
      headline: lines[1] && lines[1].length < 60 ? lines[1] : '',
      email: emailMatch ? emailMatch[0] : '',
      phone: phoneMatch ? phoneMatch[0] : '',
      address: '',
      summary: '',
      work_experience: [],
      education: [],
      projects: [],
      skills: {},
      certifications: [],
      publications: [],
      languages: [],
      references: 'Available upon request',
    };
  }

  return parsed;
}

// 5. Persist extracted data to Supabase
async function persistExtractedData(profileId, extractedData) {
  if (!profileId || !extractedData) return;

  await supabase.from('extracted_profile_data').insert([{
    profile_id: profileId,
    raw_extraction: extractedData,
  }]);

  const updates = {};
  const edu = (extractedData.education && extractedData.education[0]) || {};
  if (edu.cgpa) updates.cgpa = parseFloat(edu.cgpa) || edu.cgpa;
  if (edu.degree) updates.target_degree = edu.degree;
  if (extractedData.headline) {
    updates.field_of_study = extractedData.headline;
    updates.target_field = extractedData.headline;
  }
  if (extractedData.full_name) updates.full_name = extractedData.full_name;

  if (Object.keys(updates).length > 0) {
    await supabase.from('profiles').update(updates).eq('id', profileId);
  }
}

// 6. Dynamic parse for Europass
async function parseEuropassSections(cvText, budget) {
  return extractAcademicData(cvText, budget);
}

// 7. 🏛️ MONOCHROME EXECUTIVE EUROPASS PDF (NO BLUE HEADINGS OR BORDERS)
function buildEuropassPdf(parsed) {
  try {
    const jspdfModule = require('jspdf');
    const DocClass = jspdfModule.jsPDF || jspdfModule.default || jspdfModule;
    const doc = new DocClass();

    const M = 18; // Margin
    const W = 174; // Printable Width
    let y = 20;

    function addPageIfNeeded(needed) {
      if (y + needed > 270) {
        doc.addPage();
        y = 20;
      }
    }

    // 🖤 Clean, Elegant Slate/Black Header (NO BLUE COLOR)
    function sectionHeader(title) {
      addPageIfNeeded(16);
      y += 4;
      doc.setDrawColor(203, 213, 225); // Subtle slate-gray line #CBD5E1
      doc.setLineWidth(0.4);
      doc.line(M, y, M + W, y);
      y += 4.5;
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42); // Bold Deep Charcoal/Black
      doc.setFont('helvetica', 'bold');
      doc.text(String(title || '').toUpperCase(), M, y);
      y += 6;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
    }

    const data = parsed || {};

    // ── 1. HEADER (Candidate Real Name & Role) ──
    const name = String(data.full_name || 'CURRICULUM VITAE').trim().toUpperCase();
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42); // Black
    doc.text(name, M, y);
    y += 6;

    if (data.headline) {
      doc.setFontSize(10.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(71, 85, 105); // Neutral Slate
      doc.text(String(data.headline).toUpperCase(), M, y);
      y += 4.5;
    } else {
      doc.setFontSize(9.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text('CURRICULUM VITAE', M, y);
      y += 4;
    }

    // Clean Dark Divider Line (NO BLUE)
    doc.setDrawColor(51, 65, 85);
    doc.setLineWidth(0.6);
    doc.line(M, y, M + W, y);
    y += 5.5;

    // ── 2. CONTACT INFORMATION (Dynamic from CV) ──
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);

    const col1 = M;
    const col2 = M + 90;
    let yCol1 = y;
    let yCol2 = y;

    if (data.address) {
      doc.text(`Location: ${String(data.address).split('|')[0].trim()}`, col1, yCol1);
      yCol1 += 4.5;
    }
    if (data.email) {
      doc.text(`Email: ${String(data.email).trim()}`, col1, yCol1);
      yCol1 += 4.5;
    }
    if (data.phone) {
      doc.text(`Phone: ${String(data.phone).trim()}`, col2, yCol2);
      yCol2 += 4.5;
    }
    if (data.linkedin) {
      doc.text(`LinkedIn: ${String(data.linkedin).trim()}`, col2, yCol2);
      yCol2 += 4.5;
    }

    y = Math.max(yCol1, yCol2) + 3;

    // ── 3. SUMMARY / ABOUT ME (Dynamic from CV) ──
    if (data.summary) {
      sectionHeader('About Me');
      doc.setFontSize(9.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      const sumLines = doc.splitTextToSize(String(data.summary).replace(/\s+/g, ' ').trim(), W);
      doc.text(sumLines, M, y);
      y += sumLines.length * 4.5 + 3;
    }

    // ── 4. WORK EXPERIENCE (Dynamic from CV - Essential for Professionals) ──
    const workList = Array.isArray(data.work_experience) ? data.work_experience : [];
    if (workList.length > 0) {
      sectionHeader('Work Experience');
      workList.forEach((job) => {
        addPageIfNeeded(20);
        const role = String(job?.role || job?.title || 'Professional Role').trim();
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(role, M, y);

        if (job?.period) {
          doc.setFontSize(9);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(100, 116, 139);
          doc.text(String(job.period), M + W - doc.getTextWidth(String(job.period)), y);
        }
        y += 4.5;

        const employer = [job?.employer, job?.company, job?.city].filter(Boolean).map(String).join(' · ');
        if (employer) {
          doc.setFontSize(9.5);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(71, 85, 105);
          doc.text(employer, M, y);
          y += 4.5;
        }

        if (job?.description) {
          const descLines = doc.splitTextToSize(String(job.description).replace(/\s+/g, ' ').trim(), W - 4);
          doc.setFontSize(9);
          doc.setTextColor(71, 85, 105);
          doc.text(descLines, M + 3, y);
          y += descLines.length * 4.2 + 2;
        }
        y += 2;
      });
    }

    // ── 5. EDUCATION AND TRAINING (Dynamic from CV) ──
    const eduList = Array.isArray(data.education) ? data.education : [];
    if (eduList.length > 0) {
      sectionHeader('Education and Training');
      eduList.forEach((edu) => {
        addPageIfNeeded(20);
        const deg = String(edu?.degree || 'Academic Degree').trim();
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(deg, M, y);

        if (edu?.period) {
          doc.setFontSize(9);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(100, 116, 139);
          doc.text(String(edu.period), M + W - doc.getTextWidth(String(edu.period)), y);
        }
        y += 4.5;

        const inst = [edu?.institution, edu?.university, edu?.city, edu?.cgpa ? `CGPA: ${edu.cgpa}` : ''].filter(Boolean).map(String).join(' · ');
        if (inst) {
          doc.setFontSize(9.5);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(71, 85, 105);
          doc.text(inst, M, y);
          y += 5;
        }

        if (edu?.description) {
          const descLines = doc.splitTextToSize(String(edu.description).replace(/\s+/g, ' ').trim(), W - 4);
          doc.setFontSize(9);
          doc.setTextColor(71, 85, 105);
          doc.text(descLines, M + 3, y);
          y += descLines.length * 4.2 + 2;
        }
        y += 2;
      });
    }

    // ── 6. PROJECTS (Dynamic from CV) ──
    const projList = Array.isArray(data.projects) ? data.projects : [];
    if (projList.length > 0) {
      sectionHeader('Projects');
      projList.forEach((proj) => {
        addPageIfNeeded(18);
        let pName = String(proj?.name || proj || 'Project').trim();
        let pTech = String(proj?.tech || proj?.technologies || '').trim();
        let pDesc = String(proj?.description || proj?.desc || '').trim();

        if (pName.includes('|')) {
          const parts = pName.split('|').map(p => p.trim());
          pName = parts[0];
          if (!pTech && parts[1]) pTech = parts[1];
        }

        if (pDesc.toLowerCase().startsWith(pName.toLowerCase())) {
          pDesc = pDesc.slice(pName.length).replace(/^[|:–—\s]+/, '').trim();
        }

        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42); // Black
        doc.text(`•  ${pName}`, M, y);

        if (pTech) {
          doc.setFontSize(8.5);
          doc.setFont('helvetica', 'italic');
          doc.setTextColor(100, 116, 139);
          doc.text(` [${pTech}]`, M + doc.getTextWidth(`•  ${pName}`) + 2, y);
        }
        y += 4.5;

        if (pDesc) {
          const descLines = doc.splitTextToSize(pDesc.replace(/\s+/g, ' ').trim(), W - 6);
          doc.setFontSize(9);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(71, 85, 105);
          doc.text(descLines, M + 4, y);
          y += descLines.length * 4.2 + 2;
        }
        y += 2;
      });
    }

    // ── 7. SKILLS (Dynamic from CV) ──
    const skills = data.skills || {};
    const skillEntries = [];
    if (typeof skills === 'string' && skills.trim()) {
      skillEntries.push({ label: 'Key Skills', val: skills.trim() });
    } else if (typeof skills === 'object') {
      if (skills.technical) skillEntries.push({ label: 'Technical Skills', val: skills.technical });
      if (skills.soft) skillEntries.push({ label: 'Professional Skills', val: skills.soft });
      if (skills.digital) skillEntries.push({ label: 'Specialized Skills', val: skills.digital });
      if (skills.other) skillEntries.push({ label: 'Additional Skills', val: skills.other });
    }

    if (data.languages && data.languages.length > 0) {
      const lStr = data.languages.map(l => typeof l === 'string' ? l : `${l.language || l.name || ''} (${l.level || 'Fluent'})`).join(', ');
      skillEntries.push({ label: 'Languages', val: lStr });
    }

    if (skillEntries.length > 0) {
      sectionHeader('Personal Skills');
      skillEntries.forEach(se => {
        addPageIfNeeded(12);
        doc.setFontSize(9.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(`•  ${se.label}: `, M, y);
        const labelW = doc.getTextWidth(`•  ${se.label}: `);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(71, 85, 105);
        const lines = doc.splitTextToSize(String(se.val).replace(/\s+/g, ' ').trim(), W - labelW);
        doc.text(lines, M + labelW, y);
        y += lines.length * 4.2 + 2.5;
      });
    }

    // ── 8. CERTIFICATIONS (Dynamic from CV) ──
    const certList = Array.isArray(data.certifications) ? data.certifications : [];
    if (certList.length > 0) {
      sectionHeader('Certifications & Awards');
      certList.forEach(cert => {
        addPageIfNeeded(12);
        const cName = String(cert?.name || cert?.title || cert || '').trim();
        const detail = [cert?.issuer, cert?.org, cert?.organization, cert?.year].filter(Boolean).map(String).join(' · ');
        doc.setFontSize(9.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(`•  ${cName}`, M, y);

        if (detail) {
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(100, 116, 139);
          doc.text(` (${detail})`, M + doc.getTextWidth(`•  ${cName}`), y);
        }
        y += 5;
      });
    }

    // ── 9. PUBLICATIONS (Dynamic from CV) ──
    const pubList = Array.isArray(data.publications) ? data.publications : [];
    if (pubList.length > 0) {
      sectionHeader('Publications & Research');
      pubList.forEach(pub => {
        addPageIfNeeded(14);
        const title = String(pub?.title || pub || '').trim();
        const detail = typeof pub === 'object' ? [pub?.venue, pub?.publisher, pub?.year].filter(Boolean).map(String).join(' · ') : '';
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(71, 85, 105);
        const pubText = `•  ${title}${detail ? ` — ${detail}` : ''}`;
        const pubLines = doc.splitTextToSize(pubText, W);
        doc.text(pubLines, M, y);
        y += pubLines.length * 4.2 + 2.5;
      });
    }

    // ── 10. REFERENCES ──
    if (data.references) {
      addPageIfNeeded(10);
      sectionHeader('References');
      doc.setFontSize(9);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(100, 116, 139);
      doc.text(String(data.references).trim(), M, y);
    }

    // ── 11. FOOTER & PAGE NUMBERS ──
    const totalPages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184); // Light neutral gray
      doc.text(`Page ${p} of ${totalPages}`, 105, 290, { align: 'center' });
      doc.text('Europass Curriculum Vitae', M, 290);
    }

    return doc.output('datauristring');
  } catch (pdfErr) {
    console.error('PDF error:', pdfErr.message);
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
};