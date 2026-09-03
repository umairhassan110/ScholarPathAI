import LogoSVG from './Branding/Logo'

export { LogoSVG }

export function Logo({ size = 32 }) {
  return <LogoSVG size={size} />
}

export function Card({ children, className = '', hover = false }) {
  return (
    <div className={`bg-white/95 border border-sp-border rounded-xl shadow-card ${hover ? 'card-lift' : ''} ${className}`}>
      {children}
    </div>
  )
}

export function Button({ children, variant = 'primary', onClick, className = '', type = 'button', disabled = false }) {
  const styles = {
    primary: 'bg-sp-blue text-white hover:bg-sp-blue-dark active:bg-sp-blue-dark',
    secondary: 'bg-white text-sp-navy border border-sp-border hover:border-sp-blue hover:text-sp-blue',
    ghost: 'text-sp-slate hover:text-sp-blue',
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`font-semibold text-sm px-5 py-2.5 rounded-lg transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  )
}

export function SocialIcon({ label }) {
  return (
    <div className="w-9 h-9 rounded-full border border-sp-border bg-white flex items-center justify-center text-xs font-semibold text-sp-slate hover:border-sp-blue hover:text-sp-blue transition-colors cursor-pointer">
      {label}
    </div>
  )
}

export function Badge({ children, tone = 'blue' }) {
  const tones = {
    blue: 'bg-sp-blue-light text-sp-blue-dark',
    green: 'bg-sp-green-light text-sp-green',
    amber: 'bg-sp-amber-light text-sp-amber',
    gray: 'bg-slate-100 text-sp-slate',
    red: 'bg-red-100 text-red-700',
  }
  return (
    <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${tones[tone]}`}>
      {children}
    </span>
  )
}

export function StatCard({ value, label, icon, color = 'blue' }) {
  const colors = {
    blue: 'text-sp-blue',
    green: 'text-sp-green',
    amber: 'text-sp-amber',
    red: 'text-red-600',
  }
  return (
    <Card className="p-4 card-lift">
      <div className="flex items-center gap-2 mb-1">
        {icon && <span className="text-base">{icon}</span>}
        <span className="text-xs text-sp-slate font-medium">{label}</span>
      </div>
      <p className={`text-2xl font-extrabold ${colors[color] || colors.blue}`}>{value}</p>
    </Card>
  )
}

export function Avatar({ name, size = 32 }) {
  const initial = name?.[0]?.toUpperCase() || '?'
  return (
    <div
      className="rounded-full bg-sp-blue-light flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
    >
      <span className="font-bold text-sp-blue-dark" style={{ fontSize: size * 0.4 }}>
        {initial}
      </span>
    </div>
  )
}

export function SectionHeading({ label, title, subtitle }) {
  return (
    <div className="text-center mb-12">
      {label && (
        <p className="text-xs font-bold uppercase tracking-widest text-sp-blue mb-2">{label}</p>
      )}
      <h2 className="text-3xl font-extrabold text-sp-navy">{title}</h2>
      {subtitle && (
        <p className="text-sp-slate max-w-xl mx-auto mt-3">{subtitle}</p>
      )}
    </div>
  )
}
