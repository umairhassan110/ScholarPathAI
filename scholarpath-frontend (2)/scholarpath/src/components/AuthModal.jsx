import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { Card, Button } from './UI'
import { authAPI } from '../api'

export default function AuthModal({ mode, onClose, onSwitch }) {
  const navigate = useNavigate()
  const { login, signup, loading } = useAuth()
  const [showPassword, setShowPassword] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Forgot password state
  const [forgotMode, setForgotMode] = useState(false)
  const [resetStep, setResetStep] = useState(0) // 0=enter email, 1=enter new password
  const [resetEmail, setResetEmail] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [resetMsg, setResetMsg] = useState('')
  const [resetLoading, setResetLoading] = useState(false)

  // Auto-detect reset token from email link (?reset=TOKEN
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('reset')
    if (token) {
      setResetToken(token)
      setResetStep(1)
      setForgotMode(true)
      setResetMsg('Enter your new password below.')
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  if (!mode) return null
  const isLogin = mode === 'login'

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!email || !password) {
      setError('Email and password are required')
      return
    }

    setSubmitting(true)
    try {
      if (isLogin) {
        await login(email, password)
      } else {
        if (!name.trim()) {
          setError('Full name is required')
          setSubmitting(false)
          return
        }
        await signup(name.trim(), email, password)
      }
      onClose()
      navigate('/dashboard')
    } catch (err) {
      setError(err.message || 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleForgotPassword(e) {
    e.preventDefault()
    setResetMsg('')
    setError('')

    if (!resetEmail) {
      setError('Enter your email address')
      return
    }

    setResetLoading(true)
    try {
      const res = await authAPI.forgotPassword({ email: resetEmail })
      setResetMsg(res.message || 'If that email exists, a reset link has been sent to your email.')
    } catch (err) {
      setError(err.message || 'Failed to send reset email')
    } finally {
      setResetLoading(false)
    }
  }

  async function handleResetPassword(e) {
    e.preventDefault()
    setResetMsg('')
    setError('')

    if (!newPassword || newPassword.length < 6) {
      setError('New password must be at least 6 characters')
      return
    }

    setResetLoading(true)
    try {
      const res = await authAPI.resetPassword({ token: resetToken, password: newPassword })
      setResetMsg(res.message || 'Password reset successful! You can now login.')
      setResetStep(0)
      setForgotMode(false)
      setEmail(resetEmail)
    } catch (err) {
      setError(err.message || 'Failed to reset password')
    } finally {
      setResetLoading(false)
    }
  }

  // ── Forgot Password View ──
  if (forgotMode) {
    return (
      <div className="fixed inset-0 bg-sp-navy/40 z-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-sm relative p-6">
          <button
            onClick={() => { setForgotMode(false); setResetStep(0); setError(''); setResetMsg('') }}
            aria-label="Close"
            className="absolute top-4 right-4 text-sp-slate hover:text-sp-navy text-lg leading-none"
          >
            &times;
          </button>
          <h3 className="text-xl font-bold text-sp-navy mb-1">
            {resetStep === 0 ? 'Reset your password' : 'Set new password'}
          </h3>
          <p className="text-sm text-sp-slate mb-5">
            {resetStep === 0
              ? 'Enter your email and we\'ll send you a reset link.'
              : 'Enter your new password below.'}
          </p>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2.5 mb-4">
              {error}
            </div>
          )}
          {resetMsg && (
            <div className="bg-sp-green-light border border-green-200 text-sp-green text-sm rounded-lg px-4 py-2.5 mb-4">
              {resetMsg}
            </div>
          )}

          {resetStep === 0 ? (
            <form className="flex flex-col gap-4" onSubmit={handleForgotPassword}>
              <label className="text-sm font-medium text-sp-navy">
                Email
                <input
                  className="w-full mt-1 border border-sp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-sp-blue focus:ring-1 focus:ring-sp-blue"
                  type="email"
                  placeholder="you@email.com"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                />
              </label>
              <Button variant="primary" type="submit" className="w-full" disabled={resetLoading}>
                {resetLoading ? 'Sending...' : 'Send reset link'}
              </Button>
            </form>
          ) : (
            <form className="flex flex-col gap-4" onSubmit={handleResetPassword}>
              <label className="text-sm font-medium text-sp-navy">
                New password
                <input
                  className="w-full mt-1 border border-sp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-sp-blue focus:ring-1 focus:ring-sp-blue"
                  type="password"
                  placeholder="At least 6 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </label>
              <Button variant="primary" type="submit" className="w-full" disabled={resetLoading}>
                {resetLoading ? 'Resetting...' : 'Reset password'}
              </Button>
            </form>
          )}

          <p className="text-sm text-sp-slate mt-4 text-center">
            <button
              onClick={() => { setForgotMode(false); setResetStep(0); setError(''); setResetMsg('') }}
              className="text-sp-blue font-semibold"
            >
              Back to login
            </button>
          </p>
        </Card>
      </div>
    )
  }

  // ── Login / Signup View ──
  return (
    <div className="fixed inset-0 bg-sp-navy/40 z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-sm relative p-6">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 text-sp-slate hover:text-sp-navy text-lg leading-none"
        >
          &times;
        </button>
        <h3 className="text-xl font-bold text-sp-navy mb-1">
          {isLogin ? 'Welcome back' : 'Create your account'}
        </h3>
        <p className="text-sm text-sp-slate mb-5">
          {isLogin ? 'Log in to continue your search.' : 'Start matching with universities in minutes.'}
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2.5 mb-4">
            {error}
          </div>
        )}

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          {!isLogin && (
            <label className="text-sm font-medium text-sp-navy">
              Full name
              <input
                className="w-full mt-1 border border-sp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-sp-blue focus:ring-1 focus:ring-sp-blue"
                type="text"
                placeholder="Your full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          )}
          <label className="text-sm font-medium text-sp-navy">
            Email
            <input
              className="w-full mt-1 border border-sp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-sp-blue focus:ring-1 focus:ring-sp-blue"
              type="email"
              placeholder="you@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="text-sm font-medium text-sp-navy">
            Password
            <div className="relative mt-1">
              <input
                className="w-full border border-sp-border rounded-lg px-3 py-2 pr-16 text-sm focus:outline-none focus:border-sp-blue focus:ring-1 focus:ring-sp-blue"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
          <Button variant="primary" type="submit" className="w-full mt-1" disabled={submitting || loading}>
            {submitting || loading ? 'Please wait…' : isLogin ? 'Log in' : 'Create account'}
          </Button>
        </form>

        {/* Forgot password link - only on login */}
        {isLogin && (
          <p className="text-sm text-center mt-3">
            <button onClick={() => { setForgotMode(true); setError(''); setResetMsg('') }} className="text-sp-blue font-semibold">
              Forgot password?
            </button>
          </p>
        )}

        <p className="text-sm text-sp-slate mt-4 text-center">
          {isLogin ? "Don't have an account? " : 'Already have an account? '}
          <button onClick={onSwitch} className="text-sp-blue font-semibold">
            {isLogin ? 'Sign up' : 'Log in'}
          </button>
        </p>
      </Card>
    </div>
  )
}
