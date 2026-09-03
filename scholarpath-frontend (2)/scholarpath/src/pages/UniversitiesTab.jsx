import { useState, useEffect } from 'react'
import { Card, Button, Badge } from '../components/UI'
import { universitiesAPI } from '../api'

function TopUniversityCard({ u, rank }) {
  const [showGuide, setShowGuide] = useState(false)

  return (
    <Card className="p-6 relative">
      <div className="absolute -top-2 -left-2 w-7 h-7 rounded-full bg-sp-blue text-white text-xs font-bold flex items-center justify-center shadow">
        {rank}
      </div>
      <p className="text-sm font-bold text-sp-navy mb-1">{u.name}</p>
      <p className="text-xs text-sp-slate mb-2">{u.country}</p>
      <div className="flex flex-wrap gap-1.5 mb-3">
        <Badge tone="green">{u.match_percentage}% match</Badge>
        <Badge tone="blue">{u.scholarship_count} scholarship{u.scholarship_count !== 1 ? 's' : ''}</Badge>
      </div>
      {(u.degree_programs || []).length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {u.degree_programs.map((d) => (
            <Badge key={d} tone="gray">{d}</Badge>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {u.official_portal_url && (
          <a href={u.official_portal_url} target="_blank" rel="noopener noreferrer">
            <Button variant="secondary" className="text-xs px-3 py-1.5">Official portal →</Button>
          </a>
        )}
        <button onClick={() => setShowGuide(!showGuide)} className="text-xs text-sp-blue underline cursor-pointer">
          {showGuide ? 'Hide guideline' : 'How to apply?'}
        </button>
      </div>
      {showGuide && (
        <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-sp-slate space-y-1.5">
          <p className="font-semibold text-sp-navy">How to Apply - {u.name}</p>
          <p><span className="font-bold text-sp-blue">1.</span> Visit the <a href={u.official_portal_url || '#'} target="_blank" rel="noopener noreferrer" className="text-sp-blue underline">official university website</a>.</p>
          <p><span className="font-bold text-sp-blue">2.</span> Go to Admissions → International Students section.</p>
          <p><span className="font-bold text-sp-blue">3.</span> Create an account on the university's application portal.</p>
          <p><span className="font-bold text-sp-blue">4.</span> Fill the online application form with your personal and academic details.</p>
          <p><span className="font-bold text-sp-blue">5.</span> Upload required documents: transcripts, degree certificate, language scores, passport copy, CV.</p>
          <p><span className="font-bold text-sp-blue">6.</span> Pay the application fee (usually $50–$150).</p>
          <p><span className="font-bold text-sp-blue">7.</span> Submit before the deadline and track your application status.</p>
        </div>
      )}
    </Card>
  )
}

export default function UniversitiesTab({ userId, profileForm }) {
  const [loading, setLoading] = useState(true)
  const [topUniversities, setTopUniversities] = useState([])
  const [topLoading, setTopLoading] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const res = await universitiesAPI.list()
        // The ranked endpoint is the single source for this screen.
        if (!res.universities?.length) setTopUniversities([])
      } catch {
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  useEffect(() => {
    if (!userId) return
    async function loadTop() {
      setTopLoading(true)
      try {
        const res = await universitiesAPI.topMatch(userId)
        setTopUniversities(res.universities || [])
      } catch {
        // Non-fatal — top match requires a saved profile
      } finally {
        setTopLoading(false)
      }
    }
    loadTop()
  }, [userId])

  // Auto-filter by profile data
  const profileCountry = profileForm?.country || ''
  const profileDegree = profileForm?.degree || ''
  const profileDepartment = profileForm?.department || ''

  const hasProfile = !!(profileCountry || profileDegree)

  return (
    <div className="space-y-8">
      {/* HEADER */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-sp-slate mb-1">
          Universities for you
        </p>
        <p className="text-sm text-sp-slate mb-4">
          {loading
            ? 'Loading universities…'
            : hasProfile
              ? `Top universities in ${profileCountry || 'all countries'}${profileDepartment ? ` for ${profileDepartment}` : ''}${profileDegree ? ` (${profileDegree})` : ''}.`
              : 'Set your target country in Profile to see matching universities.'}
        </p>

        {/* Profile context badges */}
        {hasProfile && (
          <div className="flex flex-wrap gap-2 mb-4">
            {profileCountry && <Badge tone="blue">Country: {profileCountry}</Badge>}
            {profileDepartment && <Badge tone="blue">Field: {profileDepartment}</Badge>}
            {profileDegree && <Badge tone="blue">Degree: {profileDegree}</Badge>}
          </div>
        )}

        {!hasProfile && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3">
            Go to <span className="font-semibold">Profile</span> tab → select your target country → save → then come back here to see universities in that country.
          </div>
        )}
      </div>

      {/* TOP 10 MATCHED UNIVERSITIES */}
      {userId && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-sp-slate mb-1">
            Top 10 Universities for You
          </p>
          <p className="text-sm text-sp-slate mb-4">
            {topLoading
              ? 'Calculating best matches based on your profile…'
              : topUniversities.length > 0
                ? `Ranked by compatibility with your ${profileDepartment || 'chosen'} field${profileDegree ? ` (${profileDegree})` : ''}.`
                : profileCountry
                  ? 'No matched universities yet. Save your profile and run "Find Scholarships" to see rankings.'
                  : 'Set your target country in Profile to see top matched universities.'}
          </p>
          {topLoading && (
            <div className="flex items-center gap-3 text-sm text-sp-slate py-4">
              <div className="w-5 h-5 border-2 border-sp-blue border-t-transparent rounded-full animate-spin" />
              Analyzing university matches…
            </div>
          )}
          {!topLoading && topUniversities.length > 0 && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {topUniversities.map((u, i) => (
                <TopUniversityCard key={u.university_id || u.id || i} u={u} rank={i + 1} />
              ))}
            </div>
          )}
          {!topLoading && topUniversities.length === 0 && profileCountry && (
            <Card className="p-6">
              <p className="text-sm text-sp-slate">
                No university rankings available yet. Complete your profile, upload your CV, and run "Find Scholarships" from the Profile tab to generate personalized rankings.
              </p>
            </Card>
          )}
        </div>
      )}

    </div>
  )
}
