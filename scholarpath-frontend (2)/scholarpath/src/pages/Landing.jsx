import { useState, useEffect, useRef } from 'react'
import { Card, Button, SocialIcon, Badge, Logo, SectionHeading } from '../components/UI'
import AuthModal from '../components/AuthModal'

const stats = [
  { value: '1,200+', label: 'Universities listed' },
  { value: '3,400+', label: 'Scholarships tracked' },
  { value: '40,000+', label: 'Students matched' },
]

const features = [
  {
    icon: '📋',
    title: 'Smart Profile Builder',
    body: 'Build your academic profile once - grades, test scores, interests - and our AI extracts data from your CV automatically.',
  },
  {
    icon: '🎯',
    title: 'Weighted Matching Engine',
    body: 'See your eligibility score for every scholarship - with clear reasons why you match or what\'s missing.',
  },
  {
    icon: '📄',
    title: 'Documents in One Place',
    body: 'Upload transcripts, track attestations (HEC, IBCC, MOFA), and manage everything from one dashboard.',
  },
  {
    icon: '🏛️',
    title: 'University Directory',
    body: 'Browse universities matched to your profile with direct links to official application portals.',
  },
  {
    icon: '💰',
    title: 'Scholarship Intelligence',
    body: 'AI-powered analysis of your chances - sorted by eligibility with funding details and deadlines.',
  },
  {
    icon: '📝',
    title: 'CV & Cover Letter Builder',
    body: 'Generate professional CVs and recommendation letters in Europass format with AI feedback.',
  },
]

const steps = [
  { n: '01', icon: '👤', title: 'Build Your Profile', body: 'Enter your academics, IELTS score, target country and degree - or upload your CV for auto-fill.' },
  { n: '02', icon: '🎓', title: 'Get Matched', body: 'Our weighted engine scores you against hundreds of scholarships with detailed eligibility breakdowns.' },
  { n: '03', icon: '🚀', title: 'Apply & Track', body: 'Track applications, manage documents, and never miss a deadline from your unified dashboard.' },
]

const countries = [
  { name: 'Germany', flag: 'de', count: '15+' },
  { name: 'United Kingdom', flag: 'gb', count: '12+' },
  { name: 'Australia', flag: 'au', count: '10+' },
  { name: 'Canada', flag: 'ca', count: '8+' },
  { name: 'United States', flag: 'us', count: '10+' },
  { name: 'Netherlands', flag: 'nl', count: '6+' },
]

const faqs = [
  { q: 'Is ScholarPath AI really free?', a: 'Yes! ScholarPath AI is completely free for students. You can create a profile, get matched to universities and scholarships, and track applications without any charges.' },
  { q: 'Which countries are supported?', a: 'We currently cover universities and scholarships in Germany, UK, Australia, Canada, USA, Netherlands, and more. Our database is continuously growing.' },
  { q: 'How accurate is the matching engine?', a: 'Our weighted matching engine considers your CGPA, IELTS, degree level, field of study, and target country. It provides detailed eligibility reasons so you know exactly where you stand.' },
  { q: 'Can I upload my existing CV?', a: 'Absolutely! Upload your CV and our AI will automatically extract your academic data, skills, and qualifications to fill your profile.' },
]

const showcaseScholarships = [
  { title: 'DAAD Scholarship', country: 'Germany', amount: 'Full tuition + €934/month', deadline: 'Oct 2026', tag: 'Fully Funded' },
  { title: 'Chevening Scholarship', country: 'United Kingdom', amount: 'Full tuition + living costs', deadline: 'Nov 2026', tag: 'Fully Funded' },
  { title: 'Melbourne Research', country: 'Australia', amount: 'AUD $35,000/year', deadline: 'Mar 2027', tag: 'Partial' },
]

// Animated counter hook
function useCounter(end, duration = 1500) {
  const [count, setCount] = useState(0)
  const ref = useRef(null)
  const started = useRef(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true
          const numStr = String(end).replace(/[^0-9]/g, '')
          const num = parseInt(numStr) || 0
          const step = Math.max(1, Math.floor(num / (duration / 16)))
          let current = 0
          const timer = setInterval(() => {
            current += step
            if (current >= num) {
              clearInterval(timer)
              setCount(num)
            } else {
              setCount(current)
            }
          }, 16)
        }
      },
      { threshold: 0.3 }
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [end, duration])

  return { count, ref }
}

function AnimatedStat({ value, label }) {
  const numStr = String(value).replace(/[^0-9]/g, '')
  const num = parseInt(numStr) || 0
  const suffix = String(value).replace(/[0-9,]/g, '')
  const { count, ref } = useCounter(num)

  return (
    <div ref={ref} className="text-center">
      <p className="text-3xl font-extrabold text-sp-blue animate-count-up">
        {count.toLocaleString()}{suffix}
      </p>
      <p className="text-sm text-sp-slate mt-1">{label}</p>
    </div>
  )
}

export default function Landing() {
  const [authMode, setAuthMode] = useState(null)

  // Open the login modal when arriving via /?login=1 (e.g. after a password reset)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('login')) {
      setAuthMode('login')
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  return (
    <div className="min-h-screen bg-white text-sp-navy">
      <AuthModal
        mode={authMode}
        onClose={() => setAuthMode(null)}
        onSwitch={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
      />

      {/* ── NAV ── */}
      <header className="border-b border-sp-border sticky top-0 z-40 bg-white/90 backdrop-blur">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
          <a href="#top"><Logo /></a>
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-sp-slate">
            <a href="#features" className="hover:text-sp-blue transition-colors">Features</a>
            <a href="#how" className="hover:text-sp-blue transition-colors">How it works</a>
            <a href="#scholarships" className="hover:text-sp-blue transition-colors">Scholarships</a>
            <a href="#faq" className="hover:text-sp-blue transition-colors">FAQ</a>
            <a href="#contact" className="hover:text-sp-blue transition-colors">Contact</a>
          </nav>
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => setAuthMode('login')} className="hidden sm:inline-block">
              Log in
            </Button>
            <Button variant="primary" onClick={() => setAuthMode('signup')}>
              Sign up free
            </Button>
          </div>
        </div>
      </header>

      <main id="top">
        {/* ── HERO ── */}
        <section className="bg-gradient-to-br from-blue-50 via-white to-slate-50 border-b border-sp-border">
          <div className="max-w-6xl mx-auto px-6 py-16 md:py-24 grid md:grid-cols-2 gap-12 items-center">
            <div className="animate-fade-up">
              <Badge tone="blue">⚡ AI-powered matching</Badge>
              <h1 className="text-4xl sm:text-5xl font-extrabold leading-tight mt-4 mb-5 text-sp-navy">
                Find the right university - and the funding to get there
              </h1>
              <p className="text-lg text-sp-slate mb-8 max-w-md leading-relaxed">
                ScholarPath AI matches your profile to universities and
                scholarships that genuinely fit, then keeps your documents
                and deadlines organized in one place.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button variant="primary" onClick={() => setAuthMode('signup')} className="text-base px-6 py-3">
                  Get started free
                </Button>
                <Button variant="secondary" onClick={() => setAuthMode('login')} className="text-base px-6 py-3">
                  I have an account
                </Button>
              </div>
              <p className="text-xs text-sp-slate mt-4">No credit card required · Takes 2 minutes</p>
            </div>

            <Card className="p-6 animate-fade-up delay-200">
              <p className="text-xs font-semibold uppercase tracking-wide text-sp-slate mb-4">
                Your top matches
              </p>
              <ul className="space-y-3">
                {[
                  { name: 'University of Melbourne', fit: 94, country: 'Australia' },
                  { name: 'University of Toronto', fit: 89, country: 'Canada' },
                  { name: 'TU Delft', fit: 85, country: 'Netherlands' },
                ].map((u, i) => (
                  <li key={u.name} className={`flex items-center justify-between border border-sp-border rounded-xl px-4 py-3 animate-slide-in-right delay-${(i + 1) * 100}`}>
                    <div>
                      <span className="text-sm font-semibold text-sp-navy block">{u.name}</span>
                      <span className="text-xs text-sp-slate">{u.country}</span>
                    </div>
                    <Badge tone="green">{u.fit}% match</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </section>

        {/* ── STATS ── */}
        <section className="border-b border-sp-border">
          <div className="max-w-6xl mx-auto px-6 py-10 grid grid-cols-3 gap-6 text-center">
            {stats.map((s) => (
              <AnimatedStat key={s.label} value={s.value} label={s.label} />
            ))}
          </div>
        </section>

        {/* ── FEATURES ── */}
        <section id="features" className="max-w-6xl mx-auto px-6 py-20">
          <SectionHeading
            label="Why ScholarPath"
            title="Everything you need, in one place"
            subtitle="No more juggling spreadsheets, tabs, and forgotten deadlines."
          />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => (
              <Card key={f.title} className="p-6 card-lift" hover>
                <div className="w-10 h-10 rounded-lg bg-sp-blue-light flex items-center justify-center mb-4 text-xl">
                  {f.icon}
                </div>
                <h3 className="font-bold text-sp-navy mb-2">{f.title}</h3>
                <p className="text-sm text-sp-slate leading-relaxed">{f.body}</p>
              </Card>
            ))}
          </div>
        </section>

        {/* ── HOW IT WORKS ── */}
        <section id="how" className="bg-sp-bg border-y border-sp-border">
          <div className="max-w-6xl mx-auto px-6 py-20">
            <SectionHeading
              label="Simple process"
              title="How it works"
              subtitle="From profile to application in three simple steps."
            />
            <div className="grid sm:grid-cols-3 gap-8">
              {steps.map((s, i) => (
                <div key={s.n} className="relative">
                  <Card className="p-7 card-lift h-full" hover>
                    <span className="text-5xl font-black text-sp-blue/10 absolute top-4 right-5">{s.n}</span>
                    <div className="w-10 h-10 rounded-lg bg-sp-blue flex items-center justify-center mb-4 text-xl">
                      {s.icon}
                    </div>
                    <h3 className="font-bold text-sp-navy mb-2">{s.title}</h3>
                    <p className="text-sm text-sp-slate leading-relaxed">{s.body}</p>
                  </Card>
                  {i < steps.length - 1 && (
                    <div className="hidden sm:block absolute top-1/2 -right-4 text-sp-blue text-2xl font-light">→</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── SCHOLARSHIP SHOWCASE ── */}
        <section id="scholarships" className="max-w-6xl mx-auto px-6 py-20">
          <SectionHeading
            label="Real Scholarships"
            title="Here's what you'll find"
            subtitle="These are real scholarships our matching engine has identified for students."
          />
          <div className="grid sm:grid-cols-3 gap-6">
            {showcaseScholarships.map((s) => (
              <Card key={s.title} className="p-6 card-lift border-t-4 border-t-sp-blue" hover>
                <div className="flex items-center justify-between mb-3">
                  <Badge tone="amber">{s.tag}</Badge>
                  <span className="text-xs text-sp-slate">{s.country}</span>
                </div>
                <h3 className="font-bold text-sp-navy mb-1">{s.title}</h3>
                <p className="text-sm text-sp-blue font-semibold mb-2">{s.amount}</p>
                <p className="text-xs text-sp-slate">Deadline: {s.deadline}</p>
              </Card>
            ))}
          </div>
        </section>

        {/* ── STUDY DESTINATIONS ── */}
        <section className="bg-sp-bg border-y border-sp-border">
          <div className="max-w-6xl mx-auto px-6 py-20">
            <SectionHeading
              label="Study Abroad"
              title="Popular destinations"
              subtitle="Explore universities and scholarships in top study destinations."
            />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {countries.map((c) => (
                <Card key={c.name} className="p-5 card-lift cursor-pointer" hover>
                  <div className="flex items-center gap-3 w-full">
                    <img className="w-10 h-7 object-cover rounded-sm shrink-0 shadow-sm" src={`https://flagcdn.com/w80/${c.flag}.png`} alt={`${c.name} flag`} loading="lazy" />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-sp-navy truncate">{c.name}</p>
                      <p className="text-xs text-sp-slate mt-0.5">{c.count} scholarships</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section id="faq" className="bg-sp-bg border-y border-sp-border">
          <div className="max-w-2xl mx-auto px-6 py-20">
            <SectionHeading
              label="FAQ"
              title="Common questions"
              subtitle="Everything you need to know about ScholarPath AI."
            />
            <div className="space-y-3">
              {faqs.map((f) => (
                <details key={f.q} className="group bg-white border border-sp-border rounded-xl">
                  <summary className="flex items-center justify-between px-5 py-4 text-sm font-semibold text-sp-navy">
                    {f.q}
                    <span className="faq-chevron text-sp-slate text-lg">▾</span>
                  </summary>
                  <div className="px-5 pb-4 text-sm text-sp-slate leading-relaxed">
                    {f.a}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="bg-sp-blue">
          <div className="max-w-6xl mx-auto px-6 py-16 text-center">
            <h2 className="text-3xl font-extrabold text-white mb-4">
              Ready to find your fit?
            </h2>
            <p className="text-blue-100 mb-8 max-w-lg mx-auto">
              Create your profile in a few minutes and start seeing matches right away.
            </p>
            <Button
              variant="secondary"
              onClick={() => setAuthMode('signup')}
              className="text-base px-8 py-3"
            >
              Get started free
            </Button>
          </div>
        </section>
      </main>

      {/* ── FOOTER ── */}
      <footer id="contact" className="bg-sp-navy text-white">
        <div className="max-w-6xl mx-auto px-6 py-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
          <div className="sm:col-span-2 lg:col-span-1">
            <Logo />
            <p className="text-sm text-slate-400 max-w-xs mt-3 leading-relaxed">
              AI-powered scholarship matching for students who want to study abroad.
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold mb-3 text-white">Platform</p>
            <ul className="space-y-2 text-sm text-slate-400">
              <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
              <li><a href="#how" className="hover:text-white transition-colors">How it works</a></li>
              <li><a href="#scholarships" className="hover:text-white transition-colors">Scholarships</a></li>
              <li><a href="#faq" className="hover:text-white transition-colors">FAQ</a></li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold mb-3 text-white">Contact</p>
            <a href="mailto:hello@scholarpath.ai" className="text-sm text-slate-400 hover:text-white transition-colors">
              hello@scholarpath.ai
            </a>
          </div>
          <div>
            <p className="text-sm font-semibold mb-3 text-white">Follow us</p>
            <div className="flex gap-2">
              <SocialIcon label="X" />
              <SocialIcon label="IG" />
              <SocialIcon label="TT" />
              <SocialIcon label="LI" />
            </div>
          </div>
        </div>
        <div className="border-t border-white/10">
          <p className="text-xs text-slate-500 text-center py-5">
            © 2026 ScholarPath AI - All rights reserved
          </p>
        </div>
      </footer>
    </div>
  )
}
