import { useState, useEffect } from 'react'
import { Card, Button, Badge } from '../components/UI'
import { documentsAPI } from '../api'
import DeveloperTemplate from '../components/CVTemplates/DeveloperTemplate'

function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function downloadPdf(filename, base64String) {
  if (!base64String) return
  // Extract base64 data from data URI
  const base64Data = base64String.includes(',') ? base64String.split(',')[1] : base64String
  const byteChars = atob(base64Data)
  const byteNumbers = new Array(byteChars.length)
  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i)
  }
  const byteArray = new Uint8Array(byteNumbers)
  const blob = new Blob([byteArray], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function CvBuilderCard({ userId, profileData, onProfileUpdate }) {
  const [mode] = useState('upload')
  const [fileName, setFileName] = useState(null)
  const [file, setFile] = useState(null)
  const [converted, setConverted] = useState(false)
  const [converting, setConverting] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [europassData, setEuropassData] = useState(null)
  const [extractedData, setExtractedData] = useState(null)
  const [pdfBase64, setPdfBase64] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (profileData?.extracted) setExtractedData(profileData.extracted)
  }, [profileData?.extracted])

  function handleFileChange(e) {
    const f = e.target.files?.[0]
    if (f) {
      setFile(f)
      setFileName(f.name)
      setConverted(false)
      setError('')
    }
  }

  async function handleConvert() {
    if (!file || !userId) {
      setError('Upload a CV before converting it.')
      return
    }
    setConverting(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('profile_id', userId)
      fd.append('cv', file)
      const res = await documentsAPI.convertCv(fd)
      setExtractedData(res.extracted || null)
      if (res.pdf_base64) {
        setPdfBase64(res.pdf_base64)
      }
      if (res.suggestions) setSuggestions(res.suggestions)
      setEuropassData({
        summary: res.summary || '',
        work_experience: res.work_experience || [],
        education: res.education || [],
        certifications: res.certifications || [],
        projects: res.projects || [],
        publications: res.publications || [],
        achievements: res.achievements || [],
        skills: res.skills || {},
        languages: res.languages || [],
        hobbies: res.hobbies || '',
        references: res.references || '',
      })
      setConverted(true)
      if (onProfileUpdate) onProfileUpdate()
    } catch (err) {
      setError('Conversion failed: ' + err.message)
    } finally {
      setConverting(false)
    }
  }

  function handleDownload() {
    if (pdfBase64) {
      downloadPdf(`${profileData?.full_name || 'CV'}_Europass.pdf`, pdfBase64)
    } else {
      setError('PDF not available. Try converting again.')
    }
  }

  return (
    <Card className="p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-sp-slate mb-1">
        Build your CV
      </p>
      <p className="text-sm text-sp-slate mb-5">
        Upload your CV. We will extract its data, save it to your profile, and create a professional Europass PDF.
      </p>

      {mode === 'upload' && (
        <div>
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-sp-border rounded-xl px-4 py-10 text-center cursor-pointer hover:border-sp-blue transition-colors">
            <span className="text-sm font-semibold text-sp-navy mb-1">
              {fileName || 'Click to upload your CV'}
            </span>
            <span className="text-xs text-sp-slate">PDF or DOCX, up to 10MB</span>
            <input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleFileChange} />
          </label>

          {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

          {fileName && (
            <div className="mt-4 flex flex-wrap gap-3">
              <Button variant="secondary" onClick={handleConvert}>
                {converting ? 'Extracting and converting…' : 'Extract data and convert'}
              </Button>
              {converted && (
                <Button variant="primary" onClick={handleDownload}>
                  Download PDF
                </Button>
              )}
            </div>
          )}

          {converted && (
            <div className="mt-5 border-t border-sp-border pt-5">
              <div className="flex items-center gap-2 mb-2">
                <p className="text-sm font-semibold text-sp-navy">Europass CV ready</p>
                <Badge tone="green">PDF Generated</Badge>
              </div>
              <p className="text-sm text-sp-slate mb-3">
                Your CV has been converted to Europass format using only the data from your CV.
              </p>

              {/* Europass Preview */}
              {europassData && (
                <div className="mt-5 border-t border-sp-border pt-5">
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-sm font-semibold text-sp-navy">Europass CV ready</p>
                    <Badge tone="green">PDF Generated</Badge>
                  </div>
                  <p className="text-sm text-sp-slate mb-3">
                    Your CV has been converted to Europass format using only the data from your uploaded CV.
                  </p>

                  {/* Developer Template Preview */}
                  <DeveloperTemplate data={europassData} />
                </div>
              )}
            </div>
          )}

          {suggestions.length > 0 && (
            <div className="mt-5 border-t border-sp-border pt-5">
              <p className="text-sm font-semibold text-sp-navy mb-3">AI suggestions</p>
              <ul className="space-y-2">
                {suggestions.map((s, i) => (
                  <li key={i} className="text-sm text-sp-slate flex gap-2">
                    <span className="text-sp-blue font-bold">•</span>
                    <span>{typeof s === 'string' ? s : s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            onClick={() => { setFileName(null); setFile(null); setSuggestions([]); setConverted(false); setEuropassData(null); setPdfBase64(null); setError('') }}
            className="text-xs text-sp-slate underline mt-4"
          >
            Start over
          </button>
        </div>
      )}

          {extractedData && (
            <div className="mt-5 border-t border-sp-border pt-5">
              <p className="text-sm font-semibold text-sp-navy mb-3">Data extracted from your CV</p>
              <div className="grid sm:grid-cols-3 gap-2 text-sm text-sp-slate">
                <span>CGPA: <b className="text-sp-navy">{extractedData.academics?.cgpa ?? 'Not found'}</b></span>
                <span>IELTS: <b className="text-sp-navy">{extractedData.language?.ielts_score ?? 'Not found'}</b></span>
                <span>Field: <b className="text-sp-navy">{extractedData.academics?.field_of_study ?? 'Not found'}</b></span>
                <span>Degree: <b className="text-sp-navy">{extractedData.academics?.degree_level ?? 'Not found'}</b></span>
              </div>
            </div>
          )}

    </Card>
  )
}

function RecommendationLetterCard() {
  const [draftFileName, setDraftFileName] = useState(null)
  const [draftFile, setDraftFile] = useState(null)
  const [draftText, setDraftText] = useState('')
  const [generated, setGenerated] = useState(null)
  const [loading, setLoading] = useState(false)

  function handleFileChange(e) {
    const f = e.target.files?.[0]
    if (f) {
      setDraftFile(f)
      setDraftFileName(f.name)
    }
  }

  async function handleGenerate() {
    setLoading(true)
    try {
      const fd = new FormData()
      if (draftFile) {
        fd.append('draft', draftFile)
      } else if (draftText.trim()) {
        // Previously only the uploaded file was sent — pasted draft text was
        // silently dropped, so "Improve with AI" never actually reached the
        // AI and always fell through to the canned fallback below.
        fd.append('draft_text', draftText.trim())
      }
      const res = await documentsAPI.generateLetter(fd)
      if (res.letter_text) {
        setGenerated(res.letter_text)
        return
      }
      // Server responded but without letter_text — treat as a soft failure
      setGenerated('[The AI service did not return a letter. Please try again.]')
    } catch {
      // Offline fallback (server unreachable) — clearly not AI-generated.
      setGenerated(
        draftText.trim()
          ? `${draftText.trim()}\n\n[Could not reach the AI service — showing your draft unchanged. Please try again once you're back online.]`
          : `[Could not reach the AI service to generate a letter. Please check your connection and try again.]`
      )
    } finally {
      setLoading(false)
    }
  }

  function handleDownload() {
    downloadTextFile('recommendation_letter.txt', generated)
  }

  return (
    <Card className="p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-sp-slate mb-1">
        Recommendation letter generator
      </p>
      <p className="text-sm text-sp-slate mb-4">
        Upload a draft to have it polished, or leave it blank and generate one from scratch.
      </p>

      <label className="flex flex-col items-center justify-center border-2 border-dashed border-sp-border rounded-xl px-4 py-6 text-center cursor-pointer hover:border-sp-blue transition-colors mb-4">
        <span className="text-sm font-semibold text-sp-navy mb-1">
          {draftFileName || 'Click to upload a recommendation draft (optional)'}
        </span>
        <span className="text-xs text-sp-slate">PDF, DOCX, or TXT</span>
        <input type="file" accept=".pdf,.doc,.docx,.txt" className="hidden" onChange={handleFileChange} />
      </label>

      <textarea
        value={draftText}
        onChange={(e) => setDraftText(e.target.value)}
        placeholder="Or paste your draft text here (optional - leave blank to generate one from scratch)..."
        rows={5}
        className="w-full border border-sp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-sp-blue focus:ring-1 focus:ring-sp-blue"
      />

      <div className="flex flex-wrap gap-3 mt-3">
        <Button variant="primary" onClick={handleGenerate} disabled={loading}>
          {loading ? 'Generating…' : draftText.trim() ? 'Improve with AI' : 'Generate letter'}
        </Button>
        {generated && (
          <Button variant="secondary" onClick={handleDownload}>
            Download letter
          </Button>
        )}
      </div>

      {generated && (
        <div className="mt-5 border-t border-sp-border pt-5">
          <div className="flex items-center gap-2 mb-2">
            <p className="text-sm font-semibold text-sp-navy">Your letter</p>
            <Badge tone="green">AI-generated</Badge>
          </div>
          <p className="text-sm text-sp-slate whitespace-pre-line">{generated}</p>
        </div>
      )}
    </Card>
  )
}

export default function BuildCvTab({ userId, profileData, onProfileUpdate }) {
  return (
    <div className="space-y-6">
      <CvBuilderCard userId={userId} profileData={profileData} onProfileUpdate={onProfileUpdate} />
      <RecommendationLetterCard />
    </div>
  )
}
