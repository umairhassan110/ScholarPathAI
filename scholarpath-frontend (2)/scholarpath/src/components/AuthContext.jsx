import { createContext, useContext, useState, useEffect } from 'react'
import { authAPI, setAuthData, clearAuthData, getStoredUser, getStoredToken } from '../api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const storedToken = getStoredToken()
    const storedUser = getStoredUser()
    if (!storedToken || !storedUser) {
      clearAuthData()
    }
    if (storedToken && storedUser) {
      setToken(storedToken)
      setUser(storedUser)
    }
    setLoading(false)
  }, [])

  async function signup(full_name, email, password) {
    const data = await authAPI.signup({ full_name, email, password })
    setToken(data.token)
    setUser(data.user)
    setAuthData(data.token, data.user)
    return data
  }

  async function login(email, password) {
    const data = await authAPI.login({ email, password })
    setToken(data.token)
    setUser(data.user)
    setAuthData(data.token, data.user)
    return data
  }

  function logout() {
    setToken(null)
    setUser(null)
    clearAuthData()
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, signup, login, logout, isLoggedIn: !!token }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
