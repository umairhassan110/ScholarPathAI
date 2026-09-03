import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../components/AuthContext'
import { Card, Button, Badge, StatCard, Avatar } from '../components/UI'
import ChatWidget from '../components/ChatWidget'
import BuildCvTab from './BuildCvTab'
import FaqTab from './FaqTab'
import AttestationTab from './AttestationTab'
import ProfileTab from './ProfileTab'
import UniversitiesTab from './UniversitiesTab'
import ScholarshipsTab from './ScholarshipsTab'
import { profileAPI } from '../api'
import { requiredDocuments as defaultDocs } from '../data/mockData'

const TABS = [
  { id: 'overview', label: 'Overview', icon: '📊' },
  { id: 'profile', label: 'Profile', icon: '👤' },
  { id: 'universities', label: 'Universities', icon: '🏛️' },
  { id: 'scholarships', label: 'Scholarships', icon: '🎓' },
  { id: 'buildcv', label: 'Build CV', icon: '📄' },
  { id: 'attestation', label: 'Attestations', icon: '📋' },
  { id: 'faq', label: 'FAQ', icon: '❓' },
]

const emptyProfileForm = {
  firstName: '',
  lastName: '',
  fatherName: '',
  country: '',
  phone: '',
  email: '',
  gender: '',
  cgpa: '',
  ielts: '',
  degree: '',
  department: '',
  extracurriculars: '',
  cnic: '',
  residencyCountry: '',
  fscPercentage: '',
  previousDegree: '',
  previousUniversity: '',
  previousPercentage: '',
}

function SidebarLink({ label, icon, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left text-sm font-medium px-3.5 py-2.5 rounded-lg mb-1 transition-all duration-150 flex items-center gap-2.5 ${
        active
          ? 'bg-sp-blue-light text-sp-blue-dark font-semibold'
          : 'text-sp-slate hover:bg-sp-bg hover:text-sp-navy'
      }`}
    >
      <span className="text-base">{icon}</span>
      {label}
    </button>
  )
}

function LoadingBar() {
  return (
    <div className="flex items-center gap-3 text-sm text-sp-slate py-8">
      <div className="w-5 h-5 border-2 border-sp-blue border-t-transparent rounded-full animate-spin" />
      Loading data…
    </div>
  )
}

function ErrorBanner({ message, onRetry }) {
  return (
    <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3 mb-4 flex items-center justify-between gap-3">
      <span>{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="text-sp-blue font-semibold shrink-0">
          Retry
        </button>
      )}
    </div>
  )
}

function WelcomeBanner({ completeness, onGoToProfile }) {
  const pct = completeness
    ? [completeness.has_cgpa, completeness.has_ielts, completeness.has_cv, completeness.has_target_degree].filter(Boolean).length * 25
    : 0
  if (pct >= 100) return null

  const missing = []
  if (completeness) {
    if (!completeness.has_cgpa) missing.push('Add your CGPA')
    if (!completeness.has_ielts) missing.push('Enter IELTS score')
    if (!completeness.has_cv) missing.push('Upload your CV')
    if (!completeness.has_target_degree) missing.push('Set target degree')
  }

  return (
    <Card className="p-6 mb-6 border-l-4 border-l-sp-blue animate-fade-up">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-bold text-sp-navy mb-1">Welcome! Complete your profile</h3>
          <p className="text-sm text-sp-slate mb-3">
            Fill in your details to unlock personalized scholarship matches.
          </p>
          {missing.length > 0 && (
            <ul className="space-y-1.5 mb-3">
              {missing.map((m) => (
                <li key={m} className="text-xs text-sp-slate flex items-center gap-2">
                  <span className="w-4 h-4 rounded border border-sp-border flex items-center justify-center text-[10px]">☐</span>
                  {m}
                </li>
              ))}
            </ul>
          )}
          <Button variant="primary" onClick={onGoToProfile} className="text-xs px-4 py-2">
            Complete profile →
          </Button>
        </div>
        <div className="text-center shrink-0">
          <div className="w-14 h-14 rounded-full border-4 border-sp-blue-light flex items-center justify-center">
            <span className="text-lg font-extrabold text-sp-blue">{pct}%</span>
          </div>
        </div>
      </div>
    </Card>
  )
}

function getDeadlineLabel(deadline) {
  if (!deadline) return null
  const now = new Date()
  const dl = new Date(deadline)
  const diffDays = Math.ceil((dl - now) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return { text: 'Expired', tone: 'red' }
  if (diffDays <= 7) return { text: `${diffDays}d left`, tone: 'red' }
  if (diffDays <= 30) return { text: `${diffDays}d left`, tone: 'amber' }
  if (diffDays <= 90) return { text: `${Math.floor(diffDays / 30)}mo left`, tone: 'amber' }
  return { text: deadline, tone: 'gray' }
}

function OverviewTab({ overview, matches, loading, error, onRetry, onGoToProfile }) {
  if (loading) return <LoadingBar />

  const topMatches = (matches || [])
    .filter(m => m.universities?.name)
    .sort((a, b) => (b.match_score || 0) - (a.match_score || 0))
    .slice(0, 3)

  const topScholarships = (matches || [])
    .filter(m => m.scholarships)
    .sort((a, b) => (b.match_score || 0) - (a.match_score || 0))
    .slice(0, 3)

  const soonestDeadlines = (matches || [])
    .filter(m => m.scholarships?.deadline)
    .sort((a, b) => new Date(a.scholarships.deadline) - new Date(b.scholarships.deadline))
    .slice(0, 5)

  const summary = overview?.summary
  const completeness = overview?.profile_completeness
  const pct = completeness
    ? [completeness.has_cgpa, completeness.has_ielts, completeness.has_cv, completeness.has_target_degree].filter(Boolean).length * 25
    : 0

  const eligibleCount = (matches || []).filter(m => m.status === 'Eligible').length
  const topScore = topMatches[0] ? `${Math.round(topMatches[0].match_score)}%` : '-'

  return (
    <>
      {error && <ErrorBanner message={error} onRetry={onRetry} />}

      {/* Welcome banner for new users */}
      <WelcomeBanner completeness={completeness} onGoToProfile={onGoToProfile} />

      {/* Quick stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard icon="🎯" label="Total Matches" value={(matches || []).length} color="blue" />
        <StatCard icon="✓" label="Eligible" value={eligibleCount} color="green" />
        <StatCard icon="🏆" label="Top Score" value={topScore} color="amber" />
        <StatCard icon="📅" label="Deadlines" value={soonestDeadlines.length} color="red" />
      </div>

      {/* Profile strength */}
      <Card className="p-6 mb-6">
        <div className="flex justify-between text-sm font-semibold text-sp-navy mb-2">
          <span>Profile strength</span>
          <span className="text-sp-blue">{pct}%</span>
        </div>
        <div className="w-full h-2.5 rounded-full bg-slate-100 mb-3 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-sp-blue to-blue-400 transition-all duration-700 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        {summary && (
          <div className="flex flex-wrap gap-3 text-xs">
            <span className="text-sp-green font-medium">{summary.eligible} eligible</span>
            <span className="text-sp-amber font-medium">{summary.missing_requirements} need info</span>
            <span className="text-red-600 font-medium">{summary.not_eligible} not eligible</span>
          </div>
        )}
      </Card>

      <div className="grid sm:grid-cols-2 gap-6 mb-6">
        <Card className="p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-sp-slate mb-4">
            🏛️ Top university matches
          </p>
          {topMatches.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-3xl mb-2">🎓</p>
              <p className="text-sm text-sp-slate">No matches yet</p>
              <p className="text-xs text-sp-slate mt-1">Run "Find Scholarships" from your profile.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {topMatches.map((m) => (
                <li key={m.id} className="flex justify-between items-center p-2.5 rounded-lg hover:bg-sp-bg transition-colors">
                  <span className="text-sm font-semibold text-sp-navy">{m.universities?.name}</span>
                  <Badge tone="green">{Math.round(m.match_score)}%</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-sp-slate mb-4">
            🎓 Top scholarship matches
          </p>
          {topScholarships.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-3xl mb-2">💰</p>
              <p className="text-sm text-sp-slate">No scholarships matched yet</p>
              <p className="text-xs text-sp-slate mt-1">Complete your profile first.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {topScholarships.map((m) => (
                <li key={m.id} className="flex justify-between items-center gap-2 p-2.5 rounded-lg hover:bg-sp-bg transition-colors">
                  <span className="text-sm font-semibold text-sp-navy truncate">{m.scholarships?.title || 'Unknown'}</span>
                  <span className="text-xs text-sp-slate whitespace-nowrap">{m.scholarships?.country}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-sp-slate mb-4">
          📅 Upcoming deadlines
        </p>
        {soonestDeadlines.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-3xl mb-2">📅</p>
            <p className="text-sm text-sp-slate">No upcoming deadlines</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {soonestDeadlines.map((m) => {
              const dl = getDeadlineLabel(m.scholarships?.deadline)
              return (
                <li key={m.id} className="flex justify-between items-center gap-2 p-2.5 rounded-lg hover:bg-sp-bg transition-colors">
                  <span className="text-sm font-semibold text-sp-navy truncate">{m.scholarships?.title}</span>
                  {dl ? (
                    <Badge tone={dl.tone}>{dl.text}</Badge>
                  ) : (
                    <span className="text-xs text-sp-slate whitespace-nowrap">{m.scholarships?.deadline}</span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </>
  )
}

export default function Dashboard() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('overview')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const [overview, setOverview] = useState(null)
  const [matches, setMatches] = useState([])
  const [profileData, setProfileData] = useState(null)
  const [dataLoading, setDataLoading] = useState(true)
  const [dataError, setDataError] = useState('')

  const [documents, setDocuments] = useState(defaultDocs)
  const [profileForm, setProfileForm] = useState(emptyProfileForm)

  async function loadDashboardData() {
    if (!user?.id) return
    setDataLoading(true)
    setDataError('')
    try {
      const [overviewRes, matchesRes, profileRes] = await Promise.allSettled([
        profileAPI.getOverview(user.id),
        profileAPI.getMatches(user.id),
        profileAPI.get(user.id),
      ])

      if (overviewRes.status === 'fulfilled') {
        setOverview(overviewRes.value.overview)
      }
      if (matchesRes.status === 'fulfilled') {
        setMatches(matchesRes.value.matches || [])
      }
      if (profileRes.status === 'fulfilled') {
        const p = profileRes.value.profile
        const extracted = profileRes.value.extracted || null
        setProfileData({ ...p, extracted })
        setProfileForm({
          firstName: p.full_name?.split(' ')[0] || '',
          lastName: p.full_name?.split(' ').slice(1).join(' ') || '',
          fatherName: '',
          country: p.target_country || '',
          phone: p.phone || '',
          email: p.email || '',
          gender: p.gender || '',
          dateOfBirth: p.date_of_birth || '',
          cgpa: p.cgpa != null ? String(p.cgpa) : extracted?.academics?.cgpa != null ? String(extracted.academics.cgpa) : '',
          ielts: p.ielts_score != null ? String(p.ielts_score) : extracted?.language?.ielts_score != null ? String(extracted.language.ielts_score) : '',
          degree: p.target_degree || extracted?.academics?.degree_level || '',
          department: p.target_department || p.target_field || extracted?.academics?.field_of_study || '',
          extracurriculars: '',
          cnic: p.cnic || '',
          residencyCountry: p.residency_country || '',
          fscPercentage: p.fsc_percentage != null ? String(p.fsc_percentage) : '',
          previousDegree: p.previous_degree || '',
          previousUniversity: p.previous_university || '',
          previousPercentage: (p.previous_percentage != null && String(p.previous_percentage) !== String(p.cgpa))
            ? String(p.previous_percentage)
            : '',
        })
        if (p.cv_file_path) {
          setDocuments((current) => current.map((doc) => doc.id === 'cv'
            ? { ...doc, status: 'submitted', fileName: doc.fileName || 'Saved CV' }
            : doc))
        }
      }

      const allFailed = [overviewRes, matchesRes, profileRes].every(r => r.status === 'rejected')
      if (allFailed) {
        setDataError('Could not load data from server. Showing demo data.')
      }
    } catch (err) {
      setDataError('Could not load data from server. Showing demo data.')
    } finally {
      setDataLoading(false)
    }
  }

  useEffect(() => {
    loadDashboardData()
  }, [user?.id])

  function handleLogout() {
    logout()
    navigate('/')
  }

  function handleTabClick(tabId) {
    setTab(tabId)
    setMobileMenuOpen(false)
  }

  const tabContent = {
    overview: (
      <OverviewTab
        overview={overview}
        matches={matches}
        loading={dataLoading}
        error={dataError}
        onRetry={loadDashboardData}
        onGoToProfile={() => setTab('profile')}
      />
    ),
    profile: (
      <ProfileTab
        userId={user?.id}
        form={profileForm}
        setForm={setProfileForm}
        documents={documents}
        setDocuments={setDocuments}
        profileData={profileData}
        onProfileUpdate={loadDashboardData}
      />
    ),
    attestation: <AttestationTab userId={user?.id} />,
    universities: <UniversitiesTab userId={user?.id} profileForm={profileForm} />,
    scholarships: <ScholarshipsTab userId={user?.id} matches={matches} profileForm={profileForm} />,
    buildcv: <BuildCvTab userId={user?.id} profileData={profileData} profileForm={profileForm} onProfileUpdate={loadDashboardData} />,
    faq: <FaqTab />,
  }

  const displayName = user?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'Student'

  return (
    <div className="min-h-screen text-sp-navy flex flex-col">
      {/* ── TOP BAR ── */}
      <header className="border-b border-sp-border/80 bg-white/85 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-3.5">
          <span className="text-lg font-extrabold tracking-tight text-sp-navy">
            ScholarPath<span className="text-sp-blue">.AI</span>
          </span>
          <div className="flex items-center gap-3">
            <span className="text-sm text-sp-slate hidden sm:inline">Hi, <span className="font-semibold text-sp-navy">{displayName}</span></span>
            <Avatar name={displayName} size={32} />
            <Button variant="ghost" onClick={handleLogout} className="text-xs">
              Logout
            </Button>
            {/* Mobile menu toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden w-8 h-8 rounded-lg bg-sp-bg flex items-center justify-center text-sp-slate text-sm"
            >
              {mobileMenuOpen ? '✕' : '☰'}
            </button>
          </div>
        </div>
      </header>

      {/* ── MOBILE MENU ── */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-white border-b border-sp-border px-4 py-3 animate-fade-in">
          {TABS.map((t) => (
            <SidebarLink key={t.id} label={t.label} icon={t.icon} active={tab === t.id} onClick={() => handleTabClick(t.id)} />
          ))}
        </div>
      )}

      <div className="max-w-6xl w-full mx-auto px-6 py-8 grid md:grid-cols-[200px_1fr] gap-8 flex-1">
        {/* ── SIDEBAR ── */}
        <nav className="hidden md:block md:sticky md:top-20 self-start">
          {TABS.map((t) => (
            <SidebarLink key={t.id} label={t.label} icon={t.icon} active={tab === t.id} onClick={() => setTab(t.id)} />
          ))}
        </nav>

        {/* ── CONTENT ── */}
        <main className="animate-fade-in">{tabContent[tab]}</main>
      </div>

      <ChatWidget />
    </div>
  )
}
