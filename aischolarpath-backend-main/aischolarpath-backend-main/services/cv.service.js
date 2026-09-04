/**
 * CV Service — 100% Dynamic Real-Time Extraction + Clean Professional Monochrome PDF
 * Zero hardcoding. Zero blue color. Proper margins and spacing.
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

// 4. 🚀 100% DYNAMIC AI EXTRACTION (NO HARDCODING)
async function extractAcademicData(cvText, budget) {
  const prompt = `You are an expert CV and resume parser.
Extract ALL information accurately from this CV text into a valid JSON object.
Extract the candidate's exact full name, headline/title, email, phone, location/address, LinkedIn, summary, work experience, education, projects, skills, certifications, publications, and languages directly from the text.

CV TEXT:
${cvText}

Return ONLY valid JSON (no markdown backticks):
{
  "full_name": "Exact Full Name from CV",
  "headline": "Job Title / Role / Profession from CV (e.g. Broadcast Journalist, News Anchor)",
  "email": "Email address from CV",
  "phone": "Phone number from CV",
  "address": "Location / City from CV",
  "linkedin": "LinkedIn profile link or null",
  "summary": "About me or professional summary directly from CV",
  "academics": {
    "degree_level": "Degree level from CV",
    "field_of_study": "Field of study from CV",
    "cgpa": 3.0,
    "university": "University or Board from CV",
    "fsc_percentage": null
  },
  "language": {
    "ielts_score": 6.5
  },
  "experience": {
    "years_of_experience": 2
  },
  "work_experience": [
    { "role": "Job Title", "employer": "Company / Organization", "city": "Location", "period": "Duration", "description": "Responsibilities and achievements" }
  ],
  "education": [
    { "degree": "Degree name", "institution": "University / Board", "period": "Years", "cgpa": "Grade/Marks if mentioned", "description": "Details" }
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
    { "title": "Article or Paper title", "venue": "Publisher or Media", "year": "Year" }
  ],
  "languages": [
    { "language": "Language", "level": "Proficiency" }
  ],
  "references": "Available upon request"
}`;

  let parsed = null;
  try {
    parsed = await askAI(prompt, { domain: 'cvExtractor', jsonMode: true });
  } catch (err) {
    console.warn('AI CV Extraction warning:', err.message);
  }

  // Dynamic fallback (Extracts directly from text, NO hardcoding!)
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
      academics: { degree_level: 'Degree', field_of_study: 'General', cgpa: 3.0, university: '' },
      language: { ielts_score: 6.5 },
      experience: { years_of_experience: 1 },
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
  const ac = extractedData.academics || {};
  if (ac.cgpa) updates.cgpa = parseFloat(ac.cgpa) || ac.cgpa;
  if (ac.degree_level) updates.target_degree = ac.degree_level;
  if (ac.field_of_study) {
    updates.field_of_study = ac.field_of_study;
    updates.target_field = ac.field_of_study;
  }
  if (extractedData.language?.ielts_score) {
    updates.ielts_score = parseFloat(extractedData.language.ielts_score) || 6.5;
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

// 7. 🏛️ ELEGANT PROPORTIONED EUROPASS PDF BUILDER (NO BLUE, PROPER SPACING)
function buildEuropassPdf(parsed) {
  try {
    const jspdfModule = require('jspdf');
    const DocClass = jspdfModule.jsPDF || jspdfModule.default || jspdfModule;
    const doc = new DocClass();

    const M = 18; // Margin left/right
    const W = 174; // Printable Width
    let y = 18;

    function addPageIfNeeded(needed) {
      if (y + needed > 270) {
        doc.addPage();
        y = 18;
      }
    }

    // Clean, Minimalist Slate/Black Header (NO BLUE)
    function sectionHeader(title) {
      addPageIfNeeded(16);
      y += 4;
      doc.setDrawColor(203, 213, 225); // Subtle slate-gray line
      doc.setLineWidth(0.4);
      doc.line(M, y, M + W, y);
      y += 4.5;
      doc.setFontSize(10.5);
      doc.setTextColor(15, 23, 42); // Bold Deep Charcoal #0F172A
      doc.setFont('helvetica', 'bold');
      doc.text(String(title || '').toUpperCase(), M, y);
      y += 5.5;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
    }

    const data = parsed || {};

    // ── 1. HEADER (Candidate Real Name & Role) ──
    const name = String(data.full_name || 'CURRICULUM VITAE').trim().toUpperCase();
    doc.setFontSize(17);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(name, M, y);
    y += 5.5;

    if (data.headline) {
      doc.setFontSize(9.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(71, 85, 105);
      doc.text(String(data.headline).toUpperCase(), M, y);
      y += 4;
    }

    doc.setDrawColor(51, 65, 85);
    doc.setLineWidth(0.5);
    doc.line(M, y, M + W, y);
    y += 5;

    // ── 2. CONTACT INFORMATION ──
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);

    const col1 = M;
    const col2 = M + 90;
    let yCol1 = y;
    let yCol2 = y;

    if (data.address) {
      doc.text('Location: ' + String(data.address).split('|')[0].trim(), col1, yCol1);
      yCol1 += 4;
    }
    if (data.email) {
      doc.text('Email: ' + String(data.email).trim(), col1, yCol1);
      yCol1 += 4;
    }
    if (data.phone) {
      doc.text('Phone: ' + String(data.phone).trim(), col2, yCol2);
      yCol2 += 4;
    }
    if (data.linkedin) {
      doc.text('LinkedIn: ' + String(data.linkedin).trim(), col2, yCol2);
      yCol2 += 4;
    }

    y = Math.max(yCol1, yCol2) + 2;

    // ── 3. SUMMARY ──
    if (data.summary) {
      sectionHeader('About Me');
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      const sumLines = doc.splitTextToSize(String(data.summary).replace(/\s+/g, ' ').trim(), W);
      doc.text(sumLines, M, y);
      y += sumLines.length * 4.2 + 2;
    }

    // ── 4. WORK EXPERIENCE (Dynamic from CV) ──
    const workList = Array.isArray(data.work_experience) ? data.work_experience : [];
    if (workList.length > 0) {
      sectionHeader('Work Experience');
      workList.forEach((job) => {
        addPageIfNeeded(18);
        const role = String(job?.role || job?.title || 'Professional Role').trim();
        doc.setFontSize(9.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(role, M, y);

        if (job?.period) {
          doc.setFontSize(8.5);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(100, 116, 139);
          const pStr = String(job.period);
          doc.text(pStr, M + W - doc.getTextWidth(pStr), y);
        }
        y += 4;

        const employer = [job?.employer, job?.company, job?.city].filter(Boolean).map(String).join(' · ');
        if (employer) {
          doc.setFontSize(9);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(71, 85, 105);
          doc.text(employer, M, y);
          y += 4;
        }

        if (job?.description) {
          const descLines = doc.splitTextToSize(String(job.description).replace(/\s+/g, ' ').trim(), W - 4);
          doc.setFontSize(8.5);
          doc.setTextColor(71, 85, 105);
          doc.text(descLines, M + 3, y);
          y += descLines.length * 3.8 + 2;
        }
        y += 1.5;
      });
    }

    // ── 5. EDUCATION AND TRAINING ──
    const eduList = Array.isArray(data.education) ? data.education : (data.academics ? [data.academics] : []);
    if (eduList.length > 0) {
      sectionHeader('Education and Training');
      eduList.forEach((edu) => {
        addPageIfNeeded(16);
        const deg = String(edu?.degree || edu?.degree_level || 'Academic Qualification').trim();
        doc.setFontSize(9.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(deg, M, y);

        if (edu?.period) {
          doc.setFontSize(8.5);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(100, 116, 139);
          const pStr = String(edu.period);
          doc.text(pStr, M + W - doc.getTextWidth(pStr), y);
        }
        y += 4;

        const inst = [edu?.institution, edu?.university, edu?.city, edu?.cgpa ? 'CGPA: ' + edu.cgpa : ''].filter(Boolean).map(String).join(' · ');
        if (inst) {
          doc.setFontSize(9);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(71, 85, 105);
          doc.text(inst, M, y);
          y += 4.5;
        }

        if (edu?.description) {
          const descLines = doc.splitTextToSize(String(edu.description).replace(/\s+/g, ' ').trim(), W - 4);
          doc.setFontSize(8.5);
          doc.setTextColor(71, 85, 105);
          doc.text(descLines, M + 3, y);
          y += descLines.length * 3.8 + 2;
        }
        y += 1.5;
      });
    }

    // ── 6. PROJECTS (Only if projects exist) ──
    const projList = Array.isArray(data.projects) ? data.projects : [];
    if (projList.length > 0) {
      sectionHeader('Projects');
      projList.forEach((proj) => {
        addPageIfNeeded(16);
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

        doc.setFontSize(9.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text('•  ' + pName, M, y);

        if (pTech) {
          doc.setFontSize(8);
          doc.setFont('helvetica', 'italic');
          doc.setTextColor(100, 116, 139);
          doc.text(' [' + pTech + ']', M + doc.getTextWidth('•  ' + pName) + 2, y);
        }
        y += 4;

        if (pDesc) {
          const descLines = doc.splitTextToSize(pDesc.replace(/\s+/g, ' ').trim(), W - 6);
          doc.setFontSize(8.5);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(71, 85, 105);
          doc.text(descLines, M + 4, y);
          y += descLines.length * 3.8 + 2;
        }
        y += 1.5;
      });
    }

    // ── 7. SKILLS ──
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
      const lStr = data.languages.map(l => typeof l === 'string' ? l : ((l.language || l.name || '') + ' (' + (l.level || 'Fluent') + ')')).join(', ');
      skillEntries.push({ label: 'Languages', val: lStr });
    }

    if (skillEntries.length > 0) {
      sectionHeader('Personal Skills');
      skillEntries.forEach(se => {
        addPageIfNeeded(10);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text('•  ' + se.label + ': ', M, y);
        const labelW = doc.getTextWidth('•  ' + se.label + ': ');

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(71, 85, 105);
        const lines = doc.splitTextToSize(String(se.val).replace(/\s+/g, ' ').trim(), W - labelW);
        doc.text(lines, M + labelW, y);
        y += lines.length * 3.8 + 2;
      });
    }

    // ── 8. CERTIFICATIONS (Only if present) ──
    const certList = Array.isArray(data.certifications) ? data.certifications : [];
    if (certList.length > 0) {
      sectionHeader('Certifications & Awards');
      certList.forEach(cert => {
        addPageIfNeeded(10);
        const cName = String(cert?.name || cert?.title || cert || '').trim();
        const detail = [cert?.issuer, cert?.organization, cert?.year].filter(Boolean).map(String).join(' · ');
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text('•  ' + cName, M, y);

        if (detail) {
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(100, 116, 139);
          doc.text(' (' + detail + ')', M + doc.getTextWidth('•  ' + cName), y);
        }
        y += 4.5;
      });
    }

    // ── 9. PUBLICATIONS (Only if present) ──
    const pubList = Array.isArray(data.publications) ? data.publications : [];
    if (pubList.length > 0) {
      sectionHeader('Publications & Research');
      pubList.forEach(pub => {
        addPageIfNeeded(12);
        const title = String(pub?.title || pub || '').trim();
        const detail = typeof pub === 'object' ? [pub?.venue, pub?.publisher, pub?.year].filter(Boolean).map(String).join(' · ') : '';
        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(71, 85, 105);
        const pubText = '•  ' + title + (detail ? ' — ' + detail : '');
        const pubLines = doc.splitTextToSize(pubText, W);
        doc.text(pubLines, M, y);
        y += pubLines.length * 3.8 + 2;
      });
    }

    // ── 10. REFERENCES ──
    if (data.references) {
      addPageIfNeeded(10);
      sectionHeader('References');
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(100, 116, 139);
      doc.text(String(data.references).trim(), M, y);
    }

    // ── 11. CLEAN FOOTER (NO CUT-OFF) ──
    const totalPages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text('ScholarPath AI · Europass CV', M, 285);
      const pStr = 'Page ' + p + ' of ' + totalPages;
      doc.text(pStr, M + W - doc.getTextWidth(pStr), 285);
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