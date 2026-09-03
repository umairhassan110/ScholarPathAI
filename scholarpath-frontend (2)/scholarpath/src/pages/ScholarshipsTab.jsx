import { useState, useEffect, useRef } from 'react'
import { Card, Button, Badge } from '../components/UI'
import { smartAgentAPI } from '../api'

// ── Chance Meter - visual probability indicator ──
function ChanceMeter({ chance, label, color }) {
  const colorMap = {
    green: { bg: 'bg-green-500', text: 'text-green-700', ring: 'ring-green-200', light: 'bg-green-50' },
    blue: { bg: 'bg-blue-500', text: 'text-blue-700', ring: 'ring-blue-200', light: 'bg-blue-50' },
    amber: { bg: 'bg-amber-500', text: 'text-amber-700', ring: 'ring-amber-200', light: 'bg-amber-50' },
    orange: { bg: 'bg-orange-500', text: 'text-orange-700', ring: 'ring-orange-200', light: 'bg-orange-50' },
    red: { bg: 'bg-red-500', text: 'text-red-700', ring: 'ring-red-200', light: 'bg-red-50' },
  }
  const c = colorMap[color] || colorMap.amber

  return (
    <div className="flex items-center gap-2">
      <div className={`w-10 h-10 rounded-full ${c.light} flex items-center justify-center ring-2 ${c.ring}`}>
        <span className={`text-xs font-extrabold ${c.text}`}>{chance}%</span>
      </div>
      <div>
        <p className={`text-xs font-bold ${c.text}`}>{label}</p>
        <div className="w-16 h-1.5 bg-gray-200 rounded-full mt-0.5 overflow-hidden">
          <div className={`h-full rounded-full ${c.bg} transition-all duration-500`} style={{ width: `${chance}%` }} />
        </div>
      </div>
    </div>
  )
}

// ── Eligibility Breakdown - detailed criterion-by-criterion view ──
function EligibilityBreakdown({ evidence, reasons }) {
  const [show, setShow] = useState(false)
  if (!evidence?.length) return null

  return (
    <div className="mt-3">
      <button onClick={() => setShow(!show)} className="text-xs text-sp-blue underline cursor-pointer">
        {show ? 'Hide breakdown' : 'View eligibility details'}
      </button>
      {show && (
        <div className="mt-2 space-y-1.5">
          {evidence.map((e, i) => {
            const icon = e.result === 'Pass' ? '✓' : e.result === 'Fail' ? '✗' : '?'
            const color = e.result === 'Pass' ? 'text-green-600 bg-green-50' : e.result === 'Fail' ? 'text-red-600 bg-red-50' : 'text-amber-600 bg-amber-50'
            return (
              <div key={i} className={`flex items-start gap-2 text-xs px-2.5 py-1.5 rounded ${color}`}>
                <span className="font-bold">{icon}</span>
                <div>
                  <span className="font-semibold">{e.criterion}</span>
                  {e.required != null && <span> - Required: {e.required}</span>}
                  {e.actual != null && <span>, You: {String(e.actual)}</span>}
                  {e.note && <span className="italic"> ({e.note})</span>}
                </div>
              </div>
            )
          })}
          {reasons?.length > 0 && (
            <div className="mt-2 bg-gray-50 border border-gray-200 rounded p-2">
              {reasons.map((r, i) => (
                <p key={i} className="text-xs text-gray-600">{i + 1}. {r}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Scholarship Card - redesigned ──
function ScholarshipCard({ s }) {
  const [showGuide, setShowGuide] = useState(false)
  const title = s.title || s.scholarship_title || 'Scholarship'
  const country = s.country || s.scholarship_country || ''
  const deadline = s.deadline || s.scholarship_deadline || null
  const applyUrl = s.apply_url || s.scholarship_apply_url || null
  const degree = s.degree || s.scholarship_degree || null
  const department = s.department || s.scholarship_department || null
  const uniName = s.university_name || ''

  function statusBadge() {
    if (s.status === 'Eligible') return <Badge tone="green">Eligible</Badge>
    if (s.status === 'Partially Eligible') return <Badge tone="amber">Partially Eligible</Badge>
    if (s.status === 'Not Eligible') return <Badge tone="red">Not Eligible</Badge>
    if (s.status === 'Not Scored') return <Badge tone="gray">Not Scored</Badge>
    return null
  }

  function formatDeadline(d) {
    if (!d || d === 'Varies' || d === 'null') return null
    try {
      const date = new Date(d)
      if (isNaN(date)) return d
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    } catch { return d }
  }

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-base font-bold text-sp-navy leading-tight">{title}</p>
          {uniName && <p className="text-xs text-sp-blue font-medium mt-0.5">{uniName}</p>}
          <p className="text-xs text-sp-slate mt-0.5">
            {country}
            {s.scholarship_type && s.scholarship_type !== title ? ` · ${s.scholarship_type}` : ''}
          </p>
        </div>
        <ChanceMeter chance={s.chance || 0} label={s.chance_label || 'Unknown'} color={s.chance_color || 'amber'} />
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {degree && <Badge tone="blue">{degree}</Badge>}
        {department && <Badge tone="gray">{department}</Badge>}
        {statusBadge()}
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        {s.funding && (
          <div className="bg-green-50 rounded-lg p-2">
            <p className="text-[10px] uppercase text-green-600 font-semibold">Funding</p>
            <p className="text-xs font-medium text-sp-navy">{s.funding}</p>
          </div>
        )}
        {s.funding_value > 0 && (
          <div className="bg-blue-50 rounded-lg p-2">
            <p className="text-[10px] uppercase text-blue-600 font-semibold">Value</p>
            <p className="text-xs font-medium text-sp-navy">${s.funding_value.toLocaleString()}</p>
          </div>
        )}
        {formatDeadline(deadline) && (
          <div className="bg-amber-50 rounded-lg p-2">
            <p className="text-[10px] uppercase text-amber-600 font-semibold">Deadline</p>
            <p className="text-xs font-medium text-sp-navy">{formatDeadline(deadline)}</p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {applyUrl && (
          <a href={applyUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="primary" className="text-xs px-3 py-1.5">Apply now →</Button>
          </a>
        )}
        <button onClick={() => setShowGuide(!showGuide)} className="text-xs text-sp-blue underline cursor-pointer">
          {showGuide ? 'Hide guideline' : 'How to apply?'}
        </button>
      </div>

      <EligibilityBreakdown evidence={s.evidence} reasons={s.reasons} />

      {showGuide && (
        <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-sp-slate space-y-1.5">
          <p className="font-semibold text-sp-navy">Application Guideline - {country}</p>
          {getGuideline(country).map((step, i) => (
            <p key={i}><span className="font-bold text-sp-blue">{i + 1}.</span> {step}</p>
          ))}
          {applyUrl && <p className="text-sp-blue font-medium mt-2">Official: <a href={applyUrl} target="_blank" rel="noopener noreferrer" className="underline">{applyUrl}</a></p>}
        </div>
      )}
    </Card>
  )
}

// ── Country Guidelines ──
function getGuideline(country) {
  const guides = {
    'China': [
      'Visit Campus China portal (campuschina.org) and create an account.',
      'Select your scholarship program (CSC Type A/B/C).',
      'Fill the online application with personal and academic details.',
      'Upload: passport, degree certificate, transcripts, study plan, recommendation letters.',
      'Pay the application fee if required and submit before deadline.',
      'Track status on the portal - results in 2–4 months.',
    ],
    'United Kingdom': [
      'Visit the official scholarship website (Chevening/Commonwealth/University portal).',
      'Create an account and complete the online application.',
      'Upload: transcripts, IELTS/TOEFL, personal statement, two reference letters.',
      'Write a compelling leadership essay (Chevening) or personal statement.',
      'Submit before deadline - UK scholarships close early (Oct–Jan).',
    ],
    'United States': [
      'Apply through the portal (Fulbright: foreign.fulbrightonline.org).',
      'Complete application with academic history and study objectives.',
      'Submit: transcripts, GRE/GMAT (if required), TOEFL/IELTS, SOP, 2–3 recommendations.',
      'Write clear study/research objective aligned with program goals.',
      'Attend interview if shortlisted.',
    ],
    'Canada': [
      'Visit EduCanada or university scholarship portal.',
      'Apply through the university admission portal - most scholarships are automatic with admission.',
      'Submit: transcripts, language scores, statement of intent, CV.',
      'Deadlines: December–March for Fall intake.',
    ],
    'Germany': [
      'Apply through DAAD portal (daad.de) or directly to university.',
      'Submit: transcripts, language certificates, motivation letter, CV (Europass).',
      'For research: detailed research proposal with supervisor confirmation.',
      'Deadlines: July–October for most DAAD programs.',
    ],
    'South Korea': [
      'Visit the KGSP portal (niied.go.kr) or university scholarship page.',
      'Choose your track: Embassy track (Type A) or University track (Type B/C).',
      'Submit: application form, transcripts, degree certificate, passport copy.',
      'Upload: study plan, personal statement, 2 recommendation letters, IELTS/TOPIK scores.',
      'Attend interview if shortlisted - results in 2–3 months.',
      'KGSP includes 1-year Korean language training before degree program.',
    ],
  }
  return guides[country] || [
    `Visit the official scholarship website for ${country || 'your target country'}.`,
    'Create an account and read eligibility requirements carefully.',
    'Complete the online application with accurate information.',
    'Upload all required documents before the deadline.',
    'Track your application status and respond to any requests.',
  ]
}

// ── Stats Summary ──
function StatsSummary({ stats, analysis, scrapeInfo }) {
  return (
    <Card className="p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-sp-slate mb-4">Smart Agent Analysis</p>
      <div className="grid grid-cols-4 gap-3 text-center mb-4">
        <div className="bg-green-50 rounded-lg p-3">
          <p className="text-2xl font-extrabold text-green-600">{stats.eligible}</p>
          <p className="text-xs text-green-700">Eligible</p>
        </div>
        <div className="bg-amber-50 rounded-lg p-3">
          <p className="text-2xl font-extrabold text-amber-600">{stats.partial}</p>
          <p className="text-xs text-amber-700">Partial</p>
        </div>
        <div className="bg-red-50 rounded-lg p-3">
          <p className="text-2xl font-extrabold text-red-600">{stats.not_eligible}</p>
          <p className="text-xs text-red-700">Not Eligible</p>
        </div>
        <div className="bg-blue-50 rounded-lg p-3">
          <p className="text-2xl font-extrabold text-blue-600">{stats.total}</p>
          <p className="text-xs text-blue-700">Total</p>
        </div>
      </div>
      {analysis && (
        <div className="bg-sp-green-light border border-green-200 rounded-lg p-4 text-sm text-sp-navy">
          {analysis}
        </div>
      )}
      {scrapeInfo?.source && (
        <div className={`text-xs mt-3 rounded-lg px-3 py-2 ${scrapeInfo.source === 'live_scrape' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-800'}`}>
          Data source: <span className="font-medium">{
            scrapeInfo.source === 'live_scrape' ? `Live scraped (${scrapeInfo.scraped_count} found)` :
            scrapeInfo.source === 'cached' ? 'Cached (updated within 24h)' :
            scrapeInfo.source === 'database_fallback' ? 'Database fallback (live scrape/AI structuring failed)' :
            scrapeInfo.source
          }</span>
          {scrapeInfo.scrape_errors?.length > 0 && <span className="block mt-1 opacity-80">{scrapeInfo.scrape_errors.join(' · ')}</span>}
        </div>
      )}
    </Card>
  )
}

// ── Main Component ──
export default function ScholarshipsTab({ userId, profileForm }) {
  const [agentResults, setAgentResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const hasRun = useRef(false)

  const profileCountry = profileForm?.country || ''

  // Auto-run smart agent when tab loads and user has profile
  useEffect(() => {
    if (!userId || hasRun.current) return
    if (!profileCountry && !profileForm?.department) return
    hasRun.current = true
    runSmartAgent()
  }, [userId, profileCountry])

  async function runSmartAgent() {
    if (!userId) return
    setLoading(true)
    setError('')
    try {
      const result = await smartAgentAPI.match(userId)
      setAgentResults(result)
    } catch (err) {
      setError('Smart agent failed: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const scholarships = (agentResults?.matches || []).filter((scholarship) => {
    return !(scholarship.status === 'Not Scored' && scholarship.scholarship_type === 'Scraped')
  })
  const stats = agentResults?.stats || { eligible: 0, partial: 0, not_eligible: 0, total: 0 }
  const hasProfile = !!(profileCountry || profileForm?.department)

  return (
    <div className="space-y-8">
      {/* HEADER */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-sp-slate">
            Scholarship Intelligence
          </p>
          {hasProfile && !loading && (
            <button onClick={runSmartAgent} className="text-xs text-sp-blue underline cursor-pointer">
              Re-analyze
            </button>
          )}
        </div>

        {loading && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-center gap-2">
            <span className="animate-spin text-lg">&#8635;</span>
            <div>
              <p className="text-sm font-medium text-sp-blue">Smart Agent is working...</p>
              <p className="text-xs text-sp-slate">Scraping live scholarships, analyzing your profile, calculating chances</p>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        {!hasProfile && !loading && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3">
            Go to <span className="font-semibold">Profile</span> tab → select your target country and department → save → then come back here to see your personalized scholarship matches with chances.
          </div>
        )}

        {hasProfile && !loading && (
          <div className="flex flex-wrap gap-2 mb-4">
            {profileCountry && <Badge tone="blue">Country: {profileCountry}</Badge>}
            {profileForm?.department && <Badge tone="blue">Field: {profileForm.department}</Badge>}
            {profileForm?.degree && <Badge tone="blue">Degree: {profileForm.degree}</Badge>}
          </div>
        )}
      </div>

      {/* AI ANALYSIS */}
      {agentResults?.analysis && (
        <StatsSummary stats={stats} analysis={agentResults.analysis} scrapeInfo={agentResults.scrape_info} />
      )}

      {/* PROFILE SUMMARY */}
      {agentResults?.profile_summary && (
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-sp-slate mb-2">Profile used for matching</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-sp-navy">
            <span>Degree: <b>{agentResults.profile_summary.degree || '-'}</b></span>
            <span>Field: <b>{agentResults.profile_summary.field || '-'}</b></span>
            <span>CGPA: <b>{agentResults.profile_summary.cgpa || '-'}</b></span>
            {agentResults.profile_summary.fsc_percentage && <span>FSc: <b>{agentResults.profile_summary.fsc_percentage}%</b></span>}
            <span>IELTS: <b>{agentResults.profile_summary.ielts || '-'}</b></span>
            <span>CV: <b>{agentResults.profile_summary.cv_analyzed ? 'Yes' : 'No'}</b></span>
          </div>
        </Card>
      )}

      {/* RESULTS */}
      {hasProfile && !loading && (
        <>
          {scholarships.length === 0 ? (
            <Card className="p-6 text-center">
              <p className="text-sm text-sp-slate mb-2">No scholarships found for your profile.</p>
              <p className="text-xs text-sp-slate">Try broadening your target country or department in the Profile tab, or click "Re-analyze" to retry.</p>
            </Card>
          ) : (
            <>
              <p className="text-sm text-sp-slate">
                Showing <b>{scholarships.length}</b> scholarships - sorted by your chance of getting them.
              </p>
              <div className="grid sm:grid-cols-2 gap-6">
                {scholarships.map((s) => (
                  <ScholarshipCard key={s.scholarship_id || s.id} s={s} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
