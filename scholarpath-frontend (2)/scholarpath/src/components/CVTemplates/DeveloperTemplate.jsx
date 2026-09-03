import { useRef } from 'react'

/**
 * DeveloperTemplate — print-perfect A4 CV layout
 *
 * Accepts the parsed Europass-style data object and renders a clean,
 * single-page technical portfolio document optimized for A4 printing.
 *
 * @param {object} props
 * @param {object} props.data - Parsed CV sections (summary, education, work_experience, etc.)
 * @param {object} [props.personal] - { full_name, email, phone, address }
 */
export default function DeveloperTemplate({ data, personal = {} }) {
  const printRef = useRef(null)

  const d = data || {}
  const name = personal.full_name || d.full_name || 'Your Name'
  const email = personal.email || d.email || ''
  const phone = personal.phone || d.phone || ''
  const address = personal.address || d.address || ''

  const contactParts = [address, phone, email].filter(Boolean)

  function handlePrint() {
    window.print()
  }

  return (
    <>
      {/* Print-optimized styles */}
      <style>{`
        @media print {
          body { background: white !important; color: black !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .cv-page { width: 210mm; min-height: 297mm; padding: 16mm 18mm; margin: 0; box-shadow: none; border: none; border-radius: 0; page-break-after: always; font-size: 9.5pt; }
          @page { size: A4; margin: 0; }
          .no-print { display: none !important; }
          .cv-section-title { border-bottom-color: #1a1a1a !important; color: #1a1a1a !important; }
          .cv-page a { color: #1a1a1a !important; text-decoration: none; }
        }
        @media screen {
          .cv-page { max-width: 210mm; margin: 0 auto; }
        }
      `}</style>

      {/* Print button */}
      <div className="no-print flex justify-end mb-3">
        <button
          onClick={handlePrint}
          className="bg-sp-blue text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-sp-blue-dark transition-colors"
        >
          Print / Save as PDF
        </button>
      </div>

      <div ref={printRef} className="cv-page bg-white shadow-lg border border-gray-200 rounded-lg p-8 text-gray-800 leading-relaxed" style={{ fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}>
        {/* ── HEADER ── */}
        <header className="text-center pb-4 mb-5 border-b-2 border-gray-800">
          <h1 className="text-2xl font-extrabold tracking-widest uppercase text-gray-900 mb-1">
            {name}
          </h1>
          {contactParts.length > 0 && (
            <p className="text-xs text-gray-500 tracking-wide">
              {contactParts.join(' | ')}
            </p>
          )}
        </header>

        {/* ── SUMMARY ── */}
        {d.summary && (
          <section className="mb-4">
            <h2 className="cv-section-title text-xs font-extrabold uppercase tracking-widest text-gray-900 border-b border-gray-300 pb-1 mb-2">
              Summary
            </h2>
            <p className="text-xs text-gray-700 leading-relaxed italic">
              {d.summary}
            </p>
          </section>
        )}

        {/* ── EDUCATION ── */}
        {d.education?.length > 0 && (
          <section className="mb-4">
            <h2 className="cv-section-title text-xs font-extrabold uppercase tracking-widest text-gray-900 border-b border-gray-300 pb-1 mb-2">
              Education
            </h2>
            {d.education.map((edu, i) => (
              <div key={i} className="flex justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-gray-900">{edu.degree}</p>
                  <p className="text-xs text-gray-600">
                    {edu.institution}
                    {edu.city && <span> — {edu.city}</span>}
                  </p>
                  {edu.description && (
                    <p className="text-xs text-gray-500 mt-0.5">{edu.description}</p>
                  )}
                </div>
                {edu.period && (
                  <span className="text-xs text-gray-400 shrink-0 ml-3 text-right whitespace-nowrap">
                    {edu.period}
                  </span>
                )}
              </div>
            ))}
          </section>
        )}

        {/* ── TECHNICAL SKILLS ── */}
        {d.skills && typeof d.skills === 'object' && Object.keys(d.skills).length > 0 && (
          <section className="mb-4">
            <h2 className="cv-section-title text-xs font-extrabold uppercase tracking-widest text-gray-900 border-b border-gray-300 pb-1 mb-2">
              Technical Skills
            </h2>
            <div className="space-y-1">
              {d.skills.technical && (
                <p className="text-xs text-gray-700">
                  <span className="font-bold text-gray-900">Languages / Frameworks:</span>{' '}
                  {d.skills.technical}
                </p>
              )}
              {d.skills.digital && (
                <p className="text-xs text-gray-700">
                  <span className="font-bold text-gray-900">Tools / Platforms:</span>{' '}
                  {d.skills.digital}
                </p>
              )}
              {d.skills.communication && (
                <p className="text-xs text-gray-700">
                  <span className="font-bold text-gray-900">Communication:</span>{' '}
                  {d.skills.communication}
                </p>
              )}
              {d.skills.organisational && (
                <p className="text-xs text-gray-700">
                  <span className="font-bold text-gray-900">Organisational:</span>{' '}
                  {d.skills.organisational}
                </p>
              )}
              {d.skills.other && (
                <p className="text-xs text-gray-700">
                  <span className="font-bold text-gray-900">Other:</span>{' '}
                  {d.skills.other}
                </p>
              )}
            </div>
          </section>
        )}
        {Array.isArray(d.skills) && d.skills.length > 0 && (
          <section className="mb-4">
            <h2 className="cv-section-title text-xs font-extrabold uppercase tracking-widest text-gray-900 border-b border-gray-300 pb-1 mb-2">
              Technical Skills
            </h2>
            <p className="text-xs text-gray-700">{d.skills.join(' · ')}</p>
          </section>
        )}

        {/* ── WORK EXPERIENCE ── */}
        {d.work_experience?.length > 0 && (
          <section className="mb-4">
            <h2 className="cv-section-title text-xs font-extrabold uppercase tracking-widest text-gray-900 border-b border-gray-300 pb-1 mb-2">
              Experience
            </h2>
            {d.work_experience.map((w, i) => (
              <div key={i} className="flex justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-gray-900">{w.role}</p>
                  <p className="text-xs text-gray-600">
                    {w.employer}
                    {w.city && <span> — {w.city}</span>}
                  </p>
                  {w.description && (
                    <p className="text-xs text-gray-500 mt-0.5">{w.description}</p>
                  )}
                </div>
                {w.period && (
                  <span className="text-xs text-gray-400 shrink-0 ml-3 text-right whitespace-nowrap">
                    {w.period}
                  </span>
                )}
              </div>
            ))}
          </section>
        )}

        {/* ── PROJECTS ── */}
        {d.projects?.length > 0 && (
          <section className="mb-4">
            <h2 className="cv-section-title text-xs font-extrabold uppercase tracking-widest text-gray-900 border-b border-gray-300 pb-1 mb-2">
              Projects
            </h2>
            {d.projects.map((p, i) => (
              <div key={i} className="mb-2">
                <p className="text-xs font-bold text-gray-900">{p.name}</p>
                {p.description && <p className="text-xs text-gray-600">{p.description}</p>}
                {p.technologies && (
                  <p className="text-xs text-gray-400 italic">Tech: {p.technologies}</p>
                )}
              </div>
            ))}
          </section>
        )}

        {/* ── PUBLICATIONS & RESEARCH ── */}
        {d.publications?.length > 0 && (
          <section className="mb-4">
            <h2 className="cv-section-title text-xs font-extrabold uppercase tracking-widest text-gray-900 border-b border-gray-300 pb-1 mb-2">
              Publications & Research
            </h2>
            {d.publications.map((publication, i) => (
              <p key={i} className="text-xs text-gray-700 mb-1">
                <span className="font-bold text-gray-900">{publication.title || publication}</span>
                {publication.venue && <span className="text-gray-500"> — {publication.venue}</span>}
                {publication.year && <span className="text-gray-400"> ({publication.year})</span>}
                {publication.status && <span className="text-gray-500"> — {publication.status}</span>}
              </p>
            ))}
          </section>
        )}

        {/* ── CERTIFICATIONS ── */}
        {d.certifications?.length > 0 && (
          <section className="mb-4">
            <h2 className="cv-section-title text-xs font-extrabold uppercase tracking-widest text-gray-900 border-b border-gray-300 pb-1 mb-2">
              Certifications
            </h2>
            {d.certifications.map((c, i) => (
              <div key={i} className="flex justify-between mb-1">
                <p className="text-xs text-gray-700">
                  <span className="font-bold text-gray-900">{c.name}</span>
                  {c.issuer && <span className="text-gray-500"> — {c.issuer}</span>}
                </p>
                {c.year && <span className="text-xs text-gray-400 shrink-0 ml-3">{c.year}</span>}
              </div>
            ))}
          </section>
        )}

        {/* ── ACHIEVEMENTS ── */}
        {d.achievements?.length > 0 && (
          <section className="mb-4">
            <h2 className="cv-section-title text-xs font-extrabold uppercase tracking-widest text-gray-900 border-b border-gray-300 pb-1 mb-2">
              Key Achievements
            </h2>
            <ul className="list-none pl-0 space-y-0.5">
              {d.achievements.map((a, i) => (
                <li key={i} className="text-xs text-gray-700 pl-3 relative before:content-['•'] before:absolute before:left-0 before:text-gray-400">
                  {a}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── LANGUAGES ── */}
        {d.languages?.length > 0 && (
          <section className="mb-4">
            <h2 className="cv-section-title text-xs font-extrabold uppercase tracking-widest text-gray-900 border-b border-gray-300 pb-1 mb-2">
              Languages
            </h2>
            <p className="text-xs text-gray-700">
              {d.languages.map((l) => (
                typeof l === 'string' ? l : `${l.language} (${l.level})`
              )).join(' · ')}
            </p>
          </section>
        )}
      </div>
    </>
  )
}
