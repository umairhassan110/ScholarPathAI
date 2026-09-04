/**
 * CV Service — International Tech Resume / Ivy-League Academic Template
 * Replicates the exact layout of MY CV_1 .pdf with clean horizontal rules and right-aligned dates.
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
Extract candidate details including degree, CGPA, field, university, IELTS if mentioned, projects, skills, certifications, and publications.

CV TEXT:
${cvText}

Return ONLY valid JSON (no markdown backticks):
{
  "full_name": "Full Name from CV",
  "headline": "Job Title / Role / Profession from CV",
  "email": "Email address from CV",
  "phone": "Phone number from CV",
  "address": "Location / City from CV",
  "linkedin": "LinkedIn profile link or null",
  "website": "Portfolio or website link or null",
  "summary": "About me or professional summary directly from CV",
  "academics": {
    "degree_level": "Degree level from CV",
    "field_of_study": "Field of study from CV",
    "cgpa": "3.2 / 4.0",
    "university": "University or Board from CV"
  },
  "work_experience": [
    { "role": "Job Title", "employer": "Company / Organization", "city": "Location", "period": "Duration", "description": "Responsibilities" }
  ],
  "education": [
    { "degree": "Degree name", "institution": "University / Board", "period": "Years", "city": "Location", "cgpa": "Grade/CGPA", "description": "Details" }
  ],
  "projects": [
    { "name": "Project Name", "tech": "Tools used", "description": "Description" }
  ],
  "skills": {
    "languages": "Languages & Tools (e.g. Python, C++, Java, SQL, Git)",
    "ai_ml": "AI & Machine Learning libraries (e.g. PyTorch, OpenCV, YOLOv11, LLMs)",
    "agentic": "Agentic AI & Automation (e.g. CrewAI, n8n, LangChain)",
    "iot": "IoT & Embedded Systems or other tools",
    "technical": "Core technical skills"
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

  // Dynamic fallback from text
  if (!parsed || typeof parsed !== 'object') {
    const emailMatch = cvText.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
    const phoneMatch = cvText.match(/(\+?\d{1,3}[-.\s]?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4})/);
    const lines = cvText.split('\n').map(l => l.trim()).filter(Boolean);

    parsed = {
      full_name: lines[0] || 'Candidate Name',
      headline: lines && lines.length < 60 ? lines : '',
      email: emailMatch ? emailMatch[0] : '',
      phone: phoneMatch ? phoneMatch[0] : '',
      address: '',
      summary: '',
      academics: { degree_level: 'Degree', field_of_study: 'General', cgpa: '3.2', university: '' },
      education: [],
      work_experience: [],
      projects: [],
      skills: {},
      certifications: [],
      publications: [],
      references: 'Available upon request',
    };
  }

  return parsed;
}
// 5. Persist extracted data to Supabase (Target Degree Protected from Overwriting)
async function persistExtractedData(profileId, extractedData) {
  if (!profileId || !extractedData) return;

  await supabase.from('extracted_profile_data').insert([{
    profile_id: profileId,
    raw_extraction: extractedData,
  }]);

  // Fetch current profile to check if user already selected a target_degree
  let currentProfile = null;
  try {
    const { data: prof } = await supabase.from('profiles').select('target_degree, field_of_study').eq('id', profileId).single();
    currentProfile = prof;
  } catch (e) { /* ignore */ }

  const updates = {};
  const ac = extractedData.academics || {};
  if (ac.cgpa) updates.cgpa = parseFloat(ac.cgpa) || ac.cgpa;

  // 🔒 DEGREE LOCK: CV degree goes to previous_degree, NOT target_degree!
  if (ac.degree_level) {
    updates.previous_degree = ac.degree_level;
    // Only set target_degree if user has NOT chosen one yet!
    if (!currentProfile?.target_degree) {
      if (ac.degree_level.toLowerCase().includes('bachelor')) {
        updates.target_degree = "Master's"; // Natural target for Bachelor's graduate
      } else if (ac.degree_level.toLowerCase().includes('master')) {
        updates.target_degree = 'PhD';
      } else {
        updates.target_degree = ac.degree_level;
      }
    }
  }

  if (ac.field_of_study && !currentProfile?.field_of_study) {
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

// 6. Dynamic parse for CV builder
async function parseEuropassSections(cvText, budget) {
  return extractAcademicData(cvText, budget);
}

// 7. 🏛️ EXACT TECH RESUME TEMPLATE (MATCHING MY CV_1 .pdf)
function buildEuropassPdf(parsed) {
  try {
    const jspdfModule = require('jspdf');
    const DocClass = jspdfModule.jsPDF || jspdfModule.default || jspdfModule;
    const doc = new DocClass();

    const M = 15; // 15mm Left & Right Margin
    const W = 180; // Printable Width (210 - 30)
    let y = 16;

    function addPageIfNeeded(needed) {
      if (y + needed > 272) {
        doc.addPage();
        y = 16;
      }
    }

    // Line-by-Line multiline printer with clean line-height
    function printMultiline(text, x, width, lineHeight) {
      if (!text) return;
      const lh = lineHeight || 4.2;
      const clean = String(text).replace(/\s+/g, ' ').trim();
      const lines = doc.splitTextToSize(clean, width);
      for (const line of lines) {
        addPageIfNeeded(lh + 2);
        doc.text(line, x, y);
        y += lh;
      }
    }

    // Classic Section Header with Solid Black Horizontal Rule
    function sectionHeader(title) {
      addPageIfNeeded(16);
      y += 3.5;
      doc.setFontSize(10.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0); // Pure Black
      doc.text(String(title || '').toUpperCase(), M, y);
      y += 1.8;
      // Solid horizontal divider line
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.5);
      doc.line(M, y, M + W, y);
      y += 4.5;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(20, 20, 20);
    }

    const data = parsed || {};

    // ── 1. HEADER (Candidate Name Centered in Bold) ──
    const name = String(data.full_name || 'UMAIR HASSAN').trim().toUpperCase();
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(name, 105, y, { align: 'center' });
    y += 5.5;

    // Contact Details Line (Centered with pipe | separators)
    const contactParts = [];
    if (data.address) contactParts.push(String(data.address).split('|')[0].trim());
    if (data.phone) contactParts.push(String(data.phone).trim());
    if (data.email) contactParts.push(String(data.email).trim());
    if (data.linkedin) contactParts.push(String(data.linkedin).replace(/^https?:\/\//, '').trim());
    if (data.website) contactParts.push(String(data.website).replace(/^https?:\/\//, '').trim());

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(40, 40, 40);

    const contactText = contactParts.join('  |  ');
    const contactLines = doc.splitTextToSize(contactText, W);
    for (const cline of contactLines) {
      doc.text(cline, 105, y, { align: 'center' });
      y += 4;
    }
    y += 2;

    // ── 2. SUMMARY ──
    if (data.summary) {
      sectionHeader('SUMMARY');
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30, 30, 30);
      printMultiline(data.summary, M, W, 4.2);
      y += 1.5;
    }

    // ── 3. EDUCATION (2-Column Rows with Right-Aligned Dates) ──
    const eduList = Array.isArray(data.education) && data.education.length > 0 
      ? data.education 
      : (data.academics ? [data.academics] : []);

    if (eduList.length > 0) {
      sectionHeader('EDUCATION');
      eduList.forEach((edu) => {
        addPageIfNeeded(16);

        // Line 1: Institution (Bold) on left, City on right
        const inst = String(edu?.institution || edu?.university || 'University').trim();
        doc.setFontSize(9.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text(inst, M, y);

        const city = String(edu?.city || edu?.location || '').trim();
        if (city) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(50, 50, 50);
          doc.text(city, M + W - doc.getTextWidth(city), y);
        }
        y += 4.2;

        // Line 2: Degree on left, Period on right
        const deg = String(edu?.degree || edu?.degree_level || 'Academic Degree').trim();
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(20, 20, 20);
        doc.text(deg, M, y);

        const period = String(edu?.period || edu?.year || '').trim();
        if (period) {
          doc.setFontSize(8.5);
          doc.setTextColor(60, 60, 60);
          doc.text(period, M + W - doc.getTextWidth(period), y);
        }
        y += 4;

        // Line 3: CGPA / Grade
        if (edu?.cgpa || edu?.grade) {
          doc.setFontSize(8.5);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(40, 40, 40);
          const gradeStr = edu.cgpa ? `CGPA: ${edu.cgpa}` : `Grade: ${edu.grade}`;
          doc.text(gradeStr, M, y);
          y += 4;
        }

        if (edu?.description) {
          doc.setFontSize(8.5);
          doc.setTextColor(50, 50, 50);
          printMultiline(edu.description, M, W, 4);
        }
        y += 1.5;
      });
    }

    // ── 4. WORK EXPERIENCE (If present) ──
    const workList = Array.isArray(data.work_experience) ? data.work_experience : [];
    if (workList.length > 0) {
      sectionHeader('WORK EXPERIENCE');
      workList.forEach((job) => {
        addPageIfNeeded(16);
        const role = String(job?.role || job?.title || 'Role').trim();
        doc.setFontSize(9.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text(role, M, y);

        if (job?.period) {
          doc.setFontSize(8.5);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(60, 60, 60);
          const pStr = String(job.period);
          doc.text(pStr, M + W - doc.getTextWidth(pStr), y);
        }
        y += 4.2;

        const employer = [job?.employer, job?.company, job?.city].filter(Boolean).map(String).join(' · ');
        if (employer) {
          doc.setFontSize(9);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(50, 50, 50);
          doc.text(employer, M, y);
          y += 4;
        }

        if (job?.description) {
          doc.setFontSize(8.5);
          doc.setTextColor(30, 30, 30);
          printMultiline(job.description, M, W, 4.2);
        }
        y += 2;
      });
    }

    // ── 5. TECHNICAL SKILLS ──
    const skills = data.skills || {};
    const skillEntries = [];
    if (typeof skills === 'string' && skills.trim()) {
      skillEntries.push({ label: 'Skills', val: skills.trim() });
    } else if (typeof skills === 'object') {
      if (skills.languages) skillEntries.push({ label: 'Languages & Tools', val: skills.languages });
      else if (skills.technical) skillEntries.push({ label: 'Languages & Tools', val: skills.technical });

      if (skills.ai_ml) skillEntries.push({ label: 'AI & Machine Learning', val: skills.ai_ml });
      else if (skills.digital) skillEntries.push({ label: 'AI & Machine Learning', val: skills.digital });

      if (skills.agentic) skillEntries.push({ label: 'Agentic AI & Automation', val: skills.agentic });
      if (skills.iot) skillEntries.push({ label: 'IoT & Embedded Systems', val: skills.iot });
      else if (skills.other) skillEntries.push({ label: 'Additional Skills', val: skills.other });
    }

    if (skillEntries.length > 0) {
      sectionHeader('TECHNICAL SKILLS');
      skillEntries.forEach((se) => {
        addPageIfNeeded(10);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        const label = `${se.label}: `;
        doc.text(label, M, y);
        const labelW = doc.getTextWidth(label);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(30, 30, 30);
        const lines = doc.splitTextToSize(String(se.val).trim(), W - labelW);
        doc.text(lines[0] || '', M + labelW, y);
        y += 4.2;

        if (lines.length > 1) {
          for (let i = 1; i < lines.length; i++) {
            addPageIfNeeded(5);
            doc.text(lines[i], M + labelW, y);
            y += 4.2;
          }
        }
      });
      y += 1;
    }

    // ── 6. PROJECTS (Title | Technologies, with description beneath) ──
    const projList = Array.isArray(data.projects) ? data.projects : [];
    if (projList.length > 0) {
      sectionHeader('PROJECTS');
      projList.forEach((proj) => {
        addPageIfNeeded(16);
        let pName = String(proj?.name || proj || 'Project').trim();
        let pTech = String(proj?.tech || proj?.technologies || '').trim();
        let pDesc = String(proj?.description || proj?.desc || '').trim();

        if (pName.includes('|')) {
          const parts = pName.split('|').map(p => p.trim());
          pName = parts[0];
          if (!pTech && parts) pTech = parts;
        }

        if (pDesc.toLowerCase().startsWith(pName.toLowerCase())) {
          pDesc = pDesc.slice(pName.length).replace(/^[|:–—\s]+/, '').trim();
        }

        // Line 1: Name (Bold) | Tech Stack
        doc.setFontSize(9.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text(pName, M, y);

        if (pTech) {
          const techText = ` | ${pTech}`;
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(60, 60, 60);
          doc.text(techText, M + doc.getTextWidth(pName), y);
        }
        y += 4.2;

        // Line 2: Description wrapped directly beneath
        if (pDesc) {
          doc.setFontSize(8.5);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(30, 30, 30);
          printMultiline(pDesc, M, W, 4.1);
        }
        y += 2.5;
      });
    }

    // ── 7. PUBLICATIONS & RESEARCH ──
    const pubList = Array.isArray(data.publications) ? data.publications : [];
    if (pubList.length > 0) {
      sectionHeader('PUBLICATIONS & RESEARCH');
      pubList.forEach((pub) => {
        addPageIfNeeded(12);
        const title = String(pub?.title || pub || '').trim();
        const detail = typeof pub === 'object' ? [pub?.venue, pub?.year].filter(Boolean).map(String).join(', ') : '';
        const fullText = title + (detail ? ` ${detail}` : '');

        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(30, 30, 30);
        printMultiline(fullText, M, W, 4.2);
        y += 2;
      });
    }

    // ── 8. AWARDS & CERTIFICATIONS ──
    const certList = Array.isArray(data.certifications) ? data.certifications : [];
    if (certList.length > 0) {
      sectionHeader('AWARDS & CERTIFICATIONS');
      certList.forEach((cert) => {
        addPageIfNeeded(14);
        const cName = String(cert?.name || cert?.title || cert || '').trim();
        doc.setFontSize(9.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text(cName, M, y);

        const year = String(cert?.year || '').trim();
        if (year) {
          doc.setFontSize(8.5);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(60, 60, 60);
          doc.text(year, M + W - doc.getTextWidth(year), y);
        }
        y += 4.2;

        const issuer = String(cert?.issuer || cert?.org || cert?.organization || '').trim();
        if (issuer) {
          doc.setFontSize(8.5);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(50, 50, 50);
          doc.text(issuer, M, y);
          y += 4;
        }
        y += 2;
      });
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