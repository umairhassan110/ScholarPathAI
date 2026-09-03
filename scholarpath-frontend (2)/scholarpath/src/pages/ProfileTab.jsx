import { useState, useEffect } from 'react'
import { Card, Button, Badge } from '../components/UI'
import { profileAPI, smartAgentAPI } from '../api'

const countries = ['Pakistan', 'United Kingdom', 'Canada', 'Australia', 'Germany', 'Netherlands', 'United States', 'Sweden', 'Switzerland', 'Italy', 'France', 'Japan', 'South Korea', 'China', 'Turkey', 'South Africa', 'Singapore', 'Denmark']
const degrees = ['Bachelor\'s', 'Master\'s', 'PhD']
const fields = ['Computer Science', 'Data Science', 'Artificial Intelligence', 'Software Engineering', 'Business Administration', 'Electrical Engineering', 'Medicine', 'Law', 'Mechanical Engineering', 'Civil Engineering', 'Chemistry', 'Physics', 'Mathematics', 'Biology', 'Economics', 'Psychology']
const genders = ['Female', 'Male', 'Other', 'Prefer not to say']

function FormField({ label, required, children }) {
  return (
    <label className="text-sm font-medium text-sp-navy block">
      {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      <div className="mt-1">{children}</div>
    </label>
  )
}

const inputClass =
  'w-full border border-sp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-sp-blue focus:ring-1 focus:ring-sp-blue'

function SectionHeader({ number, title, subtitle }) {
  return (
    <div className="flex items-start gap-3 mb-5">
      <span className="w-8 h-8 rounded-full bg-sp-blue text-white text-sm font-bold flex items-center justify-center shrink-0">{number}</span>
      <div>
        <p className="text-base font-bold text-sp-navy">{title}</p>
        {subtitle && <p className="text-xs text-sp-slate mt-0.5">{subtitle}</p>}
      </div>
    </div>
  )
}

export default function ProfileTab({ userId, form, setForm, documents, setDocuments, profileData, onProfileUpdate }) {
  const [saving, setSaving] = useState(false)
  const [matching, setMatching] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const hasSavedProfile = Boolean(profileData && (
    profileData.cv_file_path || profileData.extracted || profileData.target_degree ||
    profileData.target_country || profileData.cgpa != null || profileData.ielts_score != null
  ))
  const [saved, setSaved] = useState(hasSavedProfile)
  const [editing, setEditing] = useState(!hasSavedProfile)
  const [extractedData, setExtractedData] = useState(profileData?.extracted || null)
  const [analyzed, setAnalyzed] = useState(false)
  const [matched, setMatched] = useState(false)

  useEffect(() => {
    if (profileData?.extracted) {
      setExtractedData(profileData.extracted)
      setAnalyzed(true)
    }
    if (hasSavedProfile) setEditing(false)
  }, [hasSavedProfile, profileData?.extracted, profileData?.cv_file_path])

  const cvDoc = documents.find((d) => d.id === 'cv')
  const cvUploaded = cvDoc?.status === 'submitted'

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function showMessage(msg) {
    setMessage(msg)
    setError('')
    setTimeout(() => setMessage(''), 6000)
  }

  function showError(msg) {
    setError(msg)
    setMessage('')
  }

  const isBachelor = form.degree === "Bachelor's"
  const isMasterOrPhd = form.degree === "Master's" || form.degree === "PhD"

  // ── Save Profile (also used internally before matching) ──
  async function saveProfileData() {
    const body = {}
    const fullName = `${form.firstName} ${form.lastName}`.trim()
    if (fullName) body.full_name = fullName
    if (form.cgpa) body.cgpa = parseFloat(form.cgpa)
    if (form.ielts) body.ielts_score = parseFloat(form.ielts)
    if (form.country) body.target_country = form.country
    if (form.degree) body.target_degree = form.degree
    if (form.department) body.target_department = form.department
    if (form.phone) body.phone = form.phone
    if (form.gender) body.gender = form.gender
    if (form.dateOfBirth) body.date_of_birth = form.dateOfBirth
    if (form.cnic) body.cnic = form.cnic
    if (form.residencyCountry) body.residency_country = form.residencyCountry
    if (form.fscPercentage) body.fsc_percentage = parseFloat(form.fscPercentage)
    if (form.previousDegree) body.previous_degree = form.previousDegree
    if (form.previousUniversity) body.previous_university = form.previousUniversity
    if (form.previousPercentage) body.previous_percentage = parseFloat(form.previousPercentage)
    if (form.department) body.target_field = form.department

    const res = await profileAPI.update(body)
    return res
  }

  // ── Handle Save button ──
  async function handleSaveProfile() {
    if (!userId) return
    setSaving(true)
    setError('')
    try {
      const res = await saveProfileData()
      if (res.warning) {
        showMessage('Profile saved (core fields). Some new fields need migration SQL.')
      } else {
        showMessage('Profile saved successfully!')
      }
      setSaved(true)
      setEditing(false)
      if (onProfileUpdate) onProfileUpdate()
    } catch (err) {
      showError(err.message || 'Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  // ── CV Upload ──
  async function handleCvUpload(e) {
    const file = e.target.files?.[0]
    if (!file || !userId) return
    setDocuments((prev) =>
      prev.map((d) => (d.id === 'cv' ? { ...d, status: 'submitted', fileName: file.name } : d))
    )
    setAnalyzed(false)
    setMatched(false)
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('cv', file)
      await profileAPI.uploadCv(userId, formData)
      showMessage('CV uploaded! Now click "Analyze CV" to extract your data.')
    } catch (err) {
      showError('CV upload failed: ' + err.message)
    } finally {
      setUploading(false)
    }
    e.target.value = ''
  }

  // ── Analyze CV - AI extracts all data from CV ──
  async function handleAnalyze() {
    if (!userId) return
    setAnalyzing(true)
    setError('')
    try {
      const res = await profileAPI.analyze(userId)
      const extracted = res.extracted || {}
      setExtractedData(extracted)

      // Auto-fill form from nested extraction structure
      const academics = extracted.academics || {}
      const language = extracted.language || {}
      const experience = extracted.experience || {}
      setForm((prev) => ({
        ...prev,
        cgpa: academics.cgpa != null ? String(academics.cgpa) : prev.cgpa,
        fscPercentage: academics.fsc_percentage != null ? String(academics.fsc_percentage) : prev.fscPercentage,
        ielts: language.ielts_score != null ? String(language.ielts_score) : prev.ielts,
        degree: academics.degree_level || prev.degree,
        department: (academics.field_of_study && fields.includes(academics.field_of_study)) ? academics.field_of_study : prev.department,
        extracurriculars: experience.skills?.length ? experience.skills.slice(0, 5).join(', ') : prev.extracurriculars,
      }))

      setAnalyzed(true)
      showMessage('CV analyzed! Data extracted. Now click "Find Matching Scholarships" below.')
    } catch (err) {
      showError('Analysis failed: ' + err.message)
    } finally {
      setAnalyzing(false)
    }
  }

  // ── Find Matching Scholarships - saves merged data, runs smart agent ──
  async function handleFindMatching() {
    if (!userId) return
    setMatching(true)
    setError('')
    try {
      // Step 1: Save profile (merges form data + CV extracted data into DB)
      await saveProfileData()
      setSaved(true)

      // Step 2: Run smart agent (live scrape + matching + probability + AI analysis)
      await smartAgentAPI.match(userId)

      setMatched(true)
      showMessage('Smart Agent complete! Go to Scholarships tab to see your chances and eligibility breakdown.')
      if (onProfileUpdate) onProfileUpdate()
    } catch (err) {
      showError('Smart Agent failed: ' + err.message)
    } finally {
      setMatching(false)
    }
  }

  // ── Profile Summary (shown after save) ──
  function ProfileSummary() {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-between mb-5">
          <p className="text-lg font-bold text-sp-navy">Your Profile</p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => { setEditing(true); setSaved(false) }}>
              Edit Profile
            </Button>
            {!matched && analyzed && (
              <Button variant="primary" onClick={handleFindMatching} disabled={matching}>
                {matching ? 'Finding…' : 'Find Matching Scholarships'}
              </Button>
            )}
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-sp-slate mb-2">Personal Info</p>
            <div className="grid sm:grid-cols-3 gap-2 text-sm">
              <div><span className="text-sp-slate">Name:</span> <span className="font-semibold text-sp-navy">{form.firstName} {form.lastName}</span></div>
              {form.cnic && <div><span className="text-sp-slate">CNIC:</span> <span className="font-semibold text-sp-navy">{form.cnic}</span></div>}
              <div><span className="text-sp-slate">Email:</span> <span className="font-semibold text-sp-navy">{form.email || '-'}</span></div>
              {form.phone && <div><span className="text-sp-slate">Phone:</span> <span className="font-semibold text-sp-navy">{form.phone}</span></div>}
              {form.gender && <div><span className="text-sp-slate">Gender:</span> <span className="font-semibold text-sp-navy">{form.gender}</span></div>}
              {form.dateOfBirth && <div><span className="text-sp-slate">DOB:</span> <span className="font-semibold text-sp-navy">{form.dateOfBirth}</span></div>}
              {form.residencyCountry && <div><span className="text-sp-slate">Residency:</span> <span className="font-semibold text-sp-navy">{form.residencyCountry}</span></div>}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-sp-slate mb-2">Academic Qualifications</p>
            <div className="grid sm:grid-cols-3 gap-2 text-sm">
              <div><span className="text-sp-slate">Target Degree:</span> <span className="font-semibold text-sp-navy">{form.degree || '-'}</span></div>
              {isBachelor && form.fscPercentage && <div><span className="text-sp-slate">FSc/Inter %:</span> <span className="font-semibold text-sp-navy">{form.fscPercentage}%</span></div>}
              {isMasterOrPhd && form.cgpa && <div><span className="text-sp-slate">CGPA:</span> <span className="font-semibold text-sp-navy">{form.cgpa}</span></div>}
              {form.previousDegree && <div><span className="text-sp-slate">Previous:</span> <span className="font-semibold text-sp-navy">{form.previousDegree}</span></div>}
              {form.previousUniversity && <div><span className="text-sp-slate">From:</span> <span className="font-semibold text-sp-navy">{form.previousUniversity}</span></div>}
              {form.previousPercentage && form.previousPercentage !== form.cgpa && <div><span className="text-sp-slate">Marks:</span> <span className="font-semibold text-sp-navy">{form.previousPercentage}%</span></div>}
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-sp-slate mb-2">Language</p>
              <div className="text-sm"><span className="text-sp-slate">IELTS:</span> <span className="font-semibold text-sp-navy">{form.ielts || 'Not provided'}</span></div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-sp-slate mb-2">Target Preferences</p>
              <div className="grid gap-1 text-sm">
                <div><span className="text-sp-slate">Field:</span> <span className="font-semibold text-sp-navy">{form.department || '-'}</span></div>
                <div><span className="text-sp-slate">Country:</span> <span className="font-semibold text-sp-navy">{form.country || '-'}</span></div>
              </div>
            </div>
          </div>
          {/* Show CV extracted data in summary */}
          {extractedData && analyzed && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-sp-slate mb-2">CV Extracted Data (AI)</p>
              <div className="grid sm:grid-cols-3 gap-2 text-sm">
                {extractedData.academics?.cgpa != null && <div><span className="text-sp-slate">CGPA:</span> <span className="font-semibold text-sp-navy">{extractedData.academics.cgpa}</span></div>}
                {extractedData.academics?.fsc_percentage != null && <div><span className="text-sp-slate">FSc %:</span> <span className="font-semibold text-sp-navy">{extractedData.academics.fsc_percentage}%</span></div>}
                {extractedData.language?.ielts_score != null && <div><span className="text-sp-slate">IELTS:</span> <span className="font-semibold text-sp-navy">{extractedData.language.ielts_score}</span></div>}
                {extractedData.academics?.degree_level && <div><span className="text-sp-slate">Degree:</span> <span className="font-semibold text-sp-navy">{extractedData.academics.degree_level}</span></div>}
                {extractedData.academics?.field_of_study && <div><span className="text-sp-slate">Field:</span> <span className="font-semibold text-sp-navy">{extractedData.academics.field_of_study}</span></div>}
                {extractedData.experience?.years_of_experience > 0 && <div><span className="text-sp-slate">Experience:</span> <span className="font-semibold text-sp-navy">{extractedData.experience.years_of_experience} yrs</span></div>}
                {extractedData.experience?.skills?.length > 0 && (
                  <div className="sm:col-span-3">
                    <span className="text-sp-slate">Skills: </span>
                    {extractedData.experience.skills.slice(0, 8).map((s, i) => (
                      <Badge key={i} tone="blue" className="mr-1 mb-1">{s}</Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Status messages */}
      {message && (
        <div className="bg-sp-green-light border border-green-200 text-sp-green text-sm rounded-lg px-4 py-2.5">
          {message}
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2.5">
          {error}
        </div>
      )}

      {/* Show summary when saved and not editing */}
      {hasSavedProfile && !editing && <ProfileSummary />}

      {/* Show form when editing */}
      {editing && (
        <>
          {/* ── SECTION 1: Personal Info ── */}
          <Card className="p-6">
            <SectionHeader number="1" title="Personal Information" subtitle="Your basic details" />
            <div className="grid sm:grid-cols-2 gap-4">
              <FormField label="CNIC / ID Number" required>
                <input className={inputClass} type="text" placeholder="e.g. 35201-1234567-1" value={form.cnic || ''} onChange={(e) => updateField('cnic', e.target.value)} />
              </FormField>
              <FormField label="Full Name" required>
                <div className="flex gap-2">
                  <input className={inputClass} type="text" placeholder="First name" value={form.firstName} onChange={(e) => updateField('firstName', e.target.value)} />
                  <input className={inputClass} type="text" placeholder="Last name" value={form.lastName} onChange={(e) => updateField('lastName', e.target.value)} />
                </div>
              </FormField>
              <FormField label="Email">
                <input className={inputClass} type="email" placeholder="you@email.com" value={form.email} onChange={(e) => updateField('email', e.target.value)} />
              </FormField>
              <FormField label="Phone Number">
                <input className={inputClass} type="tel" placeholder="+92 300 1234567" value={form.phone} onChange={(e) => updateField('phone', e.target.value)} />
              </FormField>
              <FormField label="Gender">
                <select className={inputClass} value={form.gender} onChange={(e) => updateField('gender', e.target.value)}>
                  <option value="">Select gender</option>
                  {genders.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </FormField>
              <FormField label="Date of Birth">
                <input className={inputClass} type="date" value={form.dateOfBirth || ''} onChange={(e) => updateField('dateOfBirth', e.target.value)} />
              </FormField>
              <FormField label="Residency Country" required>
                <select className={inputClass} value={form.residencyCountry || ''} onChange={(e) => updateField('residencyCountry', e.target.value)}>
                  <option value="">Where do you currently live?</option>
                  {countries.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </FormField>
            </div>
          </Card>

          {/* ── SECTION 2: Target Degree ── */}
          <Card className="p-6">
            <SectionHeader number="2" title="Target Degree" subtitle="What degree do you want to pursue?" />
            <FormField label="Select Degree" required>
              <select className={inputClass} value={form.degree} onChange={(e) => updateField('degree', e.target.value)}>
                <option value="">Select a degree</option>
                {degrees.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </FormField>
          </Card>

          {/* ── SECTION 3: Academic Qualifications (conditional) ── */}
          {form.degree && (
            <Card className="p-6">
              <SectionHeader number="3" title="Academic Qualifications" subtitle={isBachelor ? "Enter your FSc/Intermediate marks" : "Enter your CGPA and previous degree"} />

              {isBachelor && (
                <div className="grid sm:grid-cols-2 gap-4">
                  <FormField label="FSc / Intermediate Percentage" required>
                    <input className={inputClass} type="text" placeholder="e.g. 85" value={form.fscPercentage || ''} onChange={(e) => updateField('fscPercentage', e.target.value)} />
                  </FormField>
                  <FormField label="Board / University">
                    <input className={inputClass} type="text" placeholder="e.g. BISE Lahore" value={form.previousUniversity || ''} onChange={(e) => updateField('previousUniversity', e.target.value)} />
                  </FormField>
                </div>
              )}

              {isMasterOrPhd && (
                <div className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <FormField label="CGPA (last degree)" required>
                      <input className={inputClass} type="text" placeholder="e.g. 3.7" value={form.cgpa} onChange={(e) => updateField('cgpa', e.target.value)} />
                    </FormField>
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-sp-slate mt-2">Previous Academic</p>
                  <div className="grid sm:grid-cols-3 gap-4">
                    <FormField label="Previous Degree">
                      <select className={inputClass} value={form.previousDegree || ''} onChange={(e) => updateField('previousDegree', e.target.value)}>
                        <option value="">Select</option>
                        <option value="FSc">FSc / Intermediate</option>
                        <option value="FA">FA</option>
                        <option value="DAE">DAE</option>
                        <option value="BS">BS (4 years)</option>
                        <option value="BA">BA</option>
                        <option value="BSc">BSc</option>
                        <option value="Master's">Master's</option>
                      </select>
                    </FormField>
                    <FormField label="University / Board">
                      <input className={inputClass} type="text" placeholder="e.g. UET Lahore" value={form.previousUniversity || ''} onChange={(e) => updateField('previousUniversity', e.target.value)} />
                    </FormField>
                    <FormField label="Percentage (%)">
                      <input className={inputClass} type="text" placeholder={form.cgpa ? `e.g. 80 (different from CGPA ${form.cgpa})` : 'e.g. 80'} value={form.previousPercentage || ''} onChange={(e) => updateField('previousPercentage', e.target.value)} />
                    </FormField>
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* ── SECTION 4: Language Proficiency ── */}
          {form.degree && (
            <Card className="p-6">
              <SectionHeader number="4" title="Language Proficiency" subtitle="English test score (if taken)" />
              <div className="grid sm:grid-cols-2 gap-4">
                <FormField label="IELTS Score">
                  <input className={inputClass} type="text" placeholder="e.g. 6.5 (leave empty if not taken)" value={form.ielts} onChange={(e) => updateField('ielts', e.target.value)} />
                </FormField>
              </div>
            </Card>
          )}

          {/* ── SECTION 5: Target Preferences ── */}
          {form.degree && (
            <Card className="p-6">
              <SectionHeader number="5" title="Target Preferences" subtitle="Where and what do you want to study?" />
              <div className="grid sm:grid-cols-2 gap-4">
                <FormField label="Target Field / Department" required>
                  <select className={inputClass} value={form.department} onChange={(e) => updateField('department', e.target.value)}>
                    <option value="">Select a field</option>
                    {fields.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </FormField>
                <FormField label="Target Country" required>
                  <select className={inputClass} value={form.country} onChange={(e) => updateField('country', e.target.value)}>
                    <option value="">Select a country</option>
                    {countries.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </FormField>
              </div>
            </Card>
          )}

          {/* ── SECTION 6: CV Upload + Analyze (shown after degree is selected) ── */}
          {form.degree && (
            <Card className="p-6">
              <SectionHeader number="6" title="Upload & Analyze CV" subtitle="Upload your CV - AI will extract your academic data for better matching" />
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="flex-1">
                  {cvDoc?.fileName && (
                    <p className="text-sm text-sp-navy font-medium mb-1">{cvDoc.fileName}</p>
                  )}
                  <p className="text-xs text-sp-slate">
                    {cvUploaded
                      ? analyzed ? 'CV analyzed! Data merged with your profile.' : 'Uploaded - now click "Analyze CV" to extract data'
                      : 'Upload your CV (PDF, DOCX, or TXT)'}
                  </p>
                </div>
                {uploading && (
                  <div className="w-4 h-4 border-2 border-sp-blue border-t-transparent rounded-full animate-spin" />
                )}
                <div className="flex flex-wrap gap-2">
                  <label className="inline-flex items-center px-4 py-2 bg-sp-blue text-white text-sm font-semibold rounded-lg cursor-pointer hover:bg-sp-blue-dark transition-colors">
                    {cvUploaded ? 'Replace CV' : 'Upload CV'}
                    <input type="file" className="hidden" accept=".pdf,.docx,.doc,.txt" onChange={handleCvUpload} />
                  </label>
                  {cvUploaded && (
                    <Button variant="secondary" onClick={handleAnalyze} disabled={analyzing}>
                      {analyzing ? 'Analyzing…' : analyzed ? 'Re-analyze CV' : 'Analyze CV'}
                    </Button>
                  )}
                </div>
              </div>

              {/* Show extracted data from CV */}
              {extractedData && analyzed && (
                <div className="mt-4 p-4 bg-blue-50 border border-blue-100 rounded-lg">
                  <p className="text-xs font-semibold uppercase text-sp-blue mb-2">AI extracted from your CV</p>
                  <div className="grid sm:grid-cols-3 gap-2 text-sm">
                    {extractedData.academics?.cgpa != null && <div><span className="text-sp-slate">CGPA:</span> <span className="font-semibold text-sp-navy">{extractedData.academics.cgpa}</span></div>}
                    {extractedData.academics?.fsc_percentage != null && <div><span className="text-sp-slate">FSc %:</span> <span className="font-semibold text-sp-navy">{extractedData.academics.fsc_percentage}%</span></div>}
                    {extractedData.language?.ielts_score != null && <div><span className="text-sp-slate">IELTS:</span> <span className="font-semibold text-sp-navy">{extractedData.language.ielts_score}</span></div>}
                    {extractedData.academics?.degree_level && <div><span className="text-sp-slate">Degree:</span> <span className="font-semibold text-sp-navy">{extractedData.academics.degree_level}</span></div>}
                    {extractedData.academics?.field_of_study && <div><span className="text-sp-slate">Field:</span> <span className="font-semibold text-sp-navy">{extractedData.academics.field_of_study}</span></div>}
                    {extractedData.experience?.years_of_experience > 0 && <div><span className="text-sp-slate">Experience:</span> <span className="font-semibold text-sp-navy">{extractedData.experience.years_of_experience} yrs</span></div>}
                    {extractedData.experience?.skills?.length > 0 && (
                      <div className="sm:col-span-3">
                        <span className="text-sp-slate">Skills: </span>
                        {extractedData.experience.skills.slice(0, 8).map((s, i) => (
                          <Badge key={i} tone="blue" className="mr-1 mb-1">{s}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* ── SECTION 7: Save + Find Matching ── */}
          {form.degree && (
            <Card className="p-6">
              <SectionHeader number="7" title="Save & Find Scholarships" />
              <p className="text-sm text-sp-slate mb-4">
                Save your profile first, then find matching scholarships based on your data {analyzed ? '+ CV data' : ''}.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button variant="primary" onClick={handleSaveProfile} disabled={saving}>
                  {saving ? 'Saving…' : saved ? 'Update Profile' : 'Save Profile'}
                </Button>
                {analyzed && (
                  <Button variant="secondary" onClick={handleFindMatching} disabled={matching}>
                    {matching ? 'Finding Scholarships…' : 'Find Matching Scholarships'}
                  </Button>
                )}
              </div>
              {analyzed && (
                <p className="text-xs text-sp-green mt-3">
                  CV data has been extracted. Click "Find Matching Scholarships" to run the Smart Agent - it scrapes live scholarships and calculates your chances.
                </p>
              )}
              {!analyzed && form.degree && (
                <p className="text-xs text-sp-slate mt-3">
                  Upload and analyze your CV above to unlock the matching button.
                </p>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  )
}
