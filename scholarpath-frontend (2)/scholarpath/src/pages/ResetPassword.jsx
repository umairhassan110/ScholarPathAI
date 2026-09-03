import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Card, Button, Logo } from '../components/UI'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
    </svg>
  )
}

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  // Dedicated email links use ?token=...; older links used ?reset=...
  const token = searchParams.get('token') || searchParams.get('reset')

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('Password must be at least 6 characters long')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })

      // Guard against non-JSON responses (e.g. HTML error pages)
      const contentType = res.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) {
        throw new Error(`Server error (${res.status}). Please try again.`)
      }

      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Request failed (${res.status})`)
      }

      setSuccess(true)
    } catch (err) {
      setError(err.message || 'Failed to reset password. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── Invalid / missing token ──
  if (!token) {
    return (
      <div className="min-h-screen bg-sp-bg flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-8">
          <div className="flex justify-center mb-6"><Logo /></div>
          <h1 className="text-2xl font-extrabold text-sp-navy mb-2 text-center">
            Invalid reset link
          </h1>
          <p className="text-sm text-sp-slate text-center mb-6">
            This password reset link is invalid or incomplete. Please request a
            new one from the login page.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button variant="primary" className="w-full" onClick={() => navigate('/?login=1')}>
              Go to login
            </Button>
            <Button variant="secondary" className="w-full" onClick={() => navigate('/')}>
              Back to home
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  // ── Success state ──
  if (success) {
    return (
      <div className="min-h-screen bg-sp-bg flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-8">
          <div className="flex justify-center mb-6"><Logo /></div>

          <div className="bg-sp-green-light border border-green-200 text-sp-green text-sm rounded-lg px-4 py-3 mb-6 text-center">
            Your password has been reset successfully. You can now log in with
            your new password.
          </div>

          <h1 className="text-2xl font-extrabold text-sp-navy mb-2 text-center">
            All set!
          </h1>
          <p className="text-sm text-sp-slate text-center mb-6">
            Use your new password to access your ScholarPath account.
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <Button variant="primary" className="w-full" onClick={() => navigate('/?login=1')}>
              Log in now
            </Button>
            <Button variant="secondary" className="w-full" onClick={() => navigate('/')}>
              Back to home
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  // ── Reset form ──
  return (
    <div className="min-h-screen bg-sp-bg flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8">
        <div className="flex justify-center mb-6"><Logo /></div>

        <h1 className="text-2xl font-extrabold text-sp-navy mb-1 text-center">
          Set a new password
        </h1>
        <p className="text-sm text-sp-slate text-center mb-6">
          Choose a new password for your ScholarPath account.
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2.5 mb-4">
            {error}
          </div>
        )}

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <label className="text-sm font-medium text-sp-navy">
            New password
            <div className="relative mt-1">
              <input
                className="w-full border border-sp-border rounded-lg px-3 py-2 pr-16 text-sm focus:outline-none focus:border-sp-blue focus:ring-1 focus:ring-sp-blue"
                type={showPassword ? 'text' : 'password'}
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                autoFocus
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-sp-blue"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </label>

          <label className="text-sm font-medium text-sp-navy">
            Confirm password
            <div className="relative mt-1">
              <input
                className="w-full border border-sp-border rounded-lg px-3 py-2 pr-16 text-sm focus:outline-none focus:border-sp-blue focus:ring-1 focus:ring-sp-blue"
                type={showPassword ? 'text' : 'password'}
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-sp-blue"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </label>

          <Button variant="primary" type="submit" className="w-full mt-1" disabled={loading}>
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <Spinner /> Resetting…
              </span>
            ) : (
              'Reset password'
            )}
          </Button>
        </form>

        <p className="text-sm text-sp-slate mt-6 text-center">
          Didn&apos;t request this?{' '}
          <button onClick={() => navigate('/')} className="text-sp-blue font-semibold">
            Back to home
          </button>
        </p>
      </Card>
    </div>
  )
}
