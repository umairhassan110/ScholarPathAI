/**
 * Render structured Europass sections into a clean, modern, professional PDF (jsPDF).
 * Exactly matches the web preview with proper margins, clean headers, and zero line duplication.
 * @returns data URI string or null on failure
 */
function buildEuropassPdf(parsed) {
  try {
    const doc = new jsPDF();
    doc.setCharSpace(0);
    const M = 15; // Left & Right margin
    const W = 180; // Full printable width (210 - 2*15)
    let y = 18;

    function addPageIfNeeded(needed) {
      if (y + needed > 275) {
        doc.addPage();
        y = 18;
      }
    }

    function sectionHeader(title) {
      addPageIfNeeded(16);
      y += 3;
      // Modern Europass Blue Header line
      doc.setDrawColor(18, 91, 201); // #125BC9
      doc.setLineWidth(0.6);
      doc.line(M, y, M + W, y);
      y += 4;
      doc.setFontSize(11);
      doc.setTextColor(18, 91, 201);
      doc.setFont('helvetica', 'bold');
      doc.text(title.toUpperCase(), M, y);
      y += 6;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30, 41, 59);
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

    // ── 1. HEADER (CANDIDATE NAME & TITLE) ──
    const cvName = (parsed.full_name || 'UMAIR HASSAN').toUpperCase();
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42); // Navy Dark
    doc.text(cvName, M, y);
    y += 6;

    doc.setFontSize(10.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(18, 91, 201);
    doc.text('CURRICULUM VITAE · EUROPASS FORMAT', M, y);
    y += 4;

    doc.setDrawColor(18, 91, 201);
    doc.setLineWidth(0.5);
    doc.line(M, y, M + W, y);
    y += 5;

    // ── 2. PERSONAL / CONTACT INFORMATION ──
    let rawAddress = parsed.address || '';
    let email = parsed.email || '';
    let phone = parsed.phone || '';
    let cleanAddress = '';
    let linkedin = '';
    let website = '';

    if (rawAddress.includes('|')) {
      const parts = rawAddress.split('|').map(p => p.trim()).filter(Boolean);
      parts.forEach(part => {
        if (part.includes('@') && !email) email = part;
        else if ((part.includes('+') || /\d{4,}/.test(part)) && !phone) phone = part;
        else if (part.toLowerCase().includes('linkedin') && !linkedin) linkedin = part;
        else if ((part.startsWith('http') || part.includes('.com') || part.includes('.ai')) && !website) website = part;
        else if (!cleanAddress) cleanAddress = part;
      });
    } else {
      cleanAddress = rawAddress;
    }

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);

    const contactCol1 = M;
    const contactCol2 = M + 95;
    let startContactY = y;

    if (cleanAddress) {
      doc.text(`Location: ${cleanAddress}`, contactCol1, y);
      y += 4.5;
    }
    if (email) {
      doc.text(`Email: ${email}`, contactCol1, y);
      y += 4.5;
    }

    let yCol2 = startContactY;
    if (phone) {
      doc.text(`Phone: ${phone}`, contactCol2, yCol2);
      yCol2 += 4.5;
    }
    if (linkedin) {
      doc.text(`LinkedIn: ${linkedin}`, contactCol2, yCol2);
      yCol2 += 4.5;
    } else if (website) {
      doc.text(`Portfolio: ${website}`, contactCol2, yCol2);
      yCol2 += 4.5;
    }

    y = Math.max(y, yCol2) + 2;

    // ── 3. ABOUT ME / SUMMARY ──
    if (parsed.summary) {
      sectionHeader('About Me');
      doc.setFontSize(9.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30, 41, 59);
      const sumLines = doc.splitTextToSize(parsed.summary.replace(/\s+/g, ' ').trim(), W);
      doc.text(sumLines, M, y);
      y += sumLines.length * 4.5 + 4;
    }

    // ── 4. EDUCATION AND TRAINING ──
    const education = uniqueItems(parsed.education);
    if (education.length > 0) {
      sectionHeader('Education and Training');
      education.forEach((edu) => {
        addPageIfNeeded(22);
        const deg = edu.degree || 'Bachelor of Science';
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(deg, M, y);

        if (edu.period) {
          doc.setFontSize(9);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(100, 116, 139);
          doc.text(String(edu.period), M + W - doc.getTextWidth(String(edu.period)), y);
        }
        y += 4.5;

        let inst = [edu.institution, edu.city].filter(Boolean).join(', ');
        if (inst) {
          doc.setFontSize(9.5);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(51, 65, 85);
          doc.text(inst, M, y);
          y += 4.5;
        }

        if (edu.description) {
          const descClean = String(edu.description).replace(/\s+/g, ' ').trim();
          const descLines = doc.splitTextToSize(descClean, W);
          doc.setFontSize(9);
          doc.setTextColor(71, 85, 105);
          doc.text(descLines, M, y);
          y += descLines.length * 4 + 2;
        }
        y += 2;
      });
    }

    // ── 5. PROJECTS (CLEAN & ZERO DUPLICATION) ──
    const projects = uniqueItems(parsed.projects);
    if (projects.length > 0) {
      sectionHeader('Projects');
      projects.forEach((proj) => {
        addPageIfNeeded(20);
        let pName = (proj.name || 'Project').trim();
        let pTech = (proj.technologies || '').trim();
        let pDesc = (proj.description || '').trim();

        if (pName.includes('|')) {
          const parts = pName.split('|').map(p => p.trim());
          pName = parts[0];
          if (!pTech && parts[1]) pTech = parts[1];
        }

        // Clean description from repeating project name
        if (pDesc.toLowerCase().startsWith(pName.toLowerCase())) {
          pDesc = pDesc.slice(pName.length).replace(/^[|:–—\s]+/, '').trim();
        }

        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(18, 91, 201);
        doc.text(`•  ${pName}`, M, y);

        if (pTech) {
          doc.setFontSize(8.5);
          doc.setFont('helvetica', 'italic');
          doc.setTextColor(100, 116, 139);
          doc.text(` [${pTech}]`, M + doc.getTextWidth(`•  ${pName}`) + 2, y);
        }
        y += 4.5;

        if (pDesc) {
          const sentences = pDesc.split('\n').map(s => s.trim()).filter(Boolean);
          const uniqueSentences = Array.from(new Set(sentences));
          const cleanDesc = uniqueSentences.join(' ').replace(/\s+/g, ' ').trim();

          const descLines = doc.splitTextToSize(cleanDesc, W - 6);
          doc.setFontSize(9);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(51, 65, 85);
          doc.text(descLines, M + 4, y);
          y += descLines.length * 4 + 2;
        }
        y += 2;
      });
    }

    // ── 6. SKILLS ──
    sectionHeader('Personal Skills');
    const skills = parsed.skills || {};
    const skillCategories = [
      { label: 'Technical skills', val: skills.technical },
      { label: 'AI & Machine Learning', val: skills.digital || skills.other },
      { label: 'Languages', val: (parsed.languages || []).map(l => l.language || l).join(', ') },
    ].filter(s => Boolean(s.val));

    if (skillCategories.length > 0) {
      skillCategories.forEach(cat => {
        addPageIfNeeded(12);
        doc.setFontSize(9.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 41, 59);
        doc.text(`•  ${cat.label}: `, M, y);
        const labelW = doc.getTextWidth(`•  ${cat.label}: `);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(51, 65, 85);
        const valLines = doc.splitTextToSize(String(cat.val).replace(/\s+/g, ' ').trim(), W - labelW);
        doc.text(valLines, M + labelW, y);
        y += Math.max(valLines.length * 4.2, 5) + 2;
      });
    }

    // ── 7. CERTIFICATIONS & AWARDS ──
    const certs = uniqueItems(parsed.certifications);
    if (certs.length > 0) {
      sectionHeader('Certifications & Awards');
      certs.forEach((cert) => {
        addPageIfNeeded(12);
        const cName = (cert.name || cert).trim();
        const detail = [cert.issuer, cert.year].filter(Boolean).join(' · ');
        doc.setFontSize(9.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 41, 59);
        doc.text(`•  ${cName}`, M, y);
        if (detail) {
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(100, 116, 139);
          doc.text(` (${detail})`, M + doc.getTextWidth(`•  ${cName}`), y);
        }
        y += 5.5;
      });
    }

    // ── 8. PUBLICATIONS & RESEARCH ──
    const publications = uniqueItems(parsed.publications);
    if (publications.length > 0) {
      sectionHeader('Publications & Research');
      publications.forEach((pub) => {
        addPageIfNeeded(14);
        const title = typeof pub === 'string' ? pub : pub.title;
        const detail = typeof pub === 'string' ? '' : [pub.venue, pub.year, pub.status].filter(Boolean).join(' · ');
        const fullPubText = `•  ${title || ''}${detail ? ` — ${detail}` : ''}`;
        const pubLines = doc.splitTextToSize(fullPubText.replace(/\s+/g, ' ').trim(), W);
        doc.setFontSize(9.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(30, 41, 59);
        doc.text(pubLines, M, y);
        y += pubLines.length * 4.5 + 2;
      });
    }

    // ── 9. REFERENCES ──
    addPageIfNeeded(12);
    sectionHeader('References');
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(100, 116, 139);
    doc.text('Available upon request', M, y);
    y += 6;

    // ── 10. PAGE NUMBERS & FOOTER ──
    const totalPages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(`Page ${p} of ${totalPages}`, 105, 290, { align: 'center' });
      doc.text(`Generated by ScholarPath AI`, M, 290);
    }

    return doc.output('datauristring');
  } catch (pdfErr) {
    console.error('PDF generation error:', pdfErr.message);
    return null;
  }
}