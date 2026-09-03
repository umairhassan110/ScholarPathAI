import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useSearchParams } from 'react-router-dom'
import { AuthProvider, useAuth } from './components/AuthContext'
import Landing from './pages/Landing'
import Dashboard from './pages/Dashboard'
import ResetPassword from './pages/ResetPassword'

function ProtectedRoute({ children }) {
  const { isLoggedIn, loading } = useAuth()
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    )
  }
  return isLoggedIn ? children : <Navigate to="/" replace />
}

// Legacy email links pointed at /?reset=TOKEN — forward them to the
// dedicated reset page so older links keep working.
function Home() {
  const [searchParams] = useSearchParams()
  const legacyToken = searchParams.get('reset')
  if (legacyToken) {
    return <Navigate to={`/reset-password?token=${encodeURIComponent(legacyToken)}`} replace />
  }
  return <Landing />
}

function AppRoutes() {
  const { loading } = useAuth()
  // Track initial hydration separately so login/signup loading state
  // doesn't unmount the Routes tree (which would destroy open modals).
  const [hydrated, setHydrated] = useState(
    () => !!localStorage.getItem('sp_token')
  )

  useEffect(() => {
    if (!loading) setHydrated(true)
  }, [loading])

  // Show spinner only during initial hydration (no stored token + still loading)
  if (loading && !hydrated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      {/* Public — must stay outside ProtectedRoute so unauthenticated
          users coming from the reset email never hit a redirect loop. */}
      <Route path="/reset-password" element={<ResetPassword />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  )
}
