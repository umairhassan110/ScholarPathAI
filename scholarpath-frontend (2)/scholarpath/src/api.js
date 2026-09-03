const BASE = import.meta.env.VITE_API_URL || '/api'

function getToken() {
  return localStorage.getItem('sp_token')
}

export function setAuthData(token, user) {
  localStorage.setItem('sp_token', token)
  localStorage.setItem('sp_user', JSON.stringify(user))
}

export function clearAuthData() {
  localStorage.removeItem('sp_token')
  localStorage.removeItem('sp_user')
}

export function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('sp_user'))
  } catch {
    return null
  }
}

export function getStoredToken() {
  return localStorage.getItem('sp_token')
}

async function api(path, options = {}) {
  const token = getToken()
  const headers = { ...(options.headers || {}) }

  // Only set Content-Type for non-FormData requests
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const url = `${BASE}${path}`

  let res
  try {
    res = await fetch(url, { ...options, headers })
  } catch (networkError) {
    // fetch throws TypeError when the server is unreachable (no response at all)
    console.error('Network error:', networkError.message, 'URL:', url)
    throw new Error(
      'Server is unreachable. Please make sure the backend server is running on http://localhost:3000.'
    )
  }

  // Handle non-JSON responses (e.g. HTML error pages from timeout or SPA fallback)
  const contentType = res.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    if (!res.ok) {
      throw new Error(`Server error (${res.status}). Please try again - the request may have timed out.`)
    }
    throw new Error('Unexpected response format from server. Make sure the backend is running.')
  }

  let data
  try {
    data = await res.json()
  } catch (parseError) {
    throw new Error('Failed to parse server response. Please try again.')
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      clearAuthData()
      if (window.location.pathname === '/dashboard') window.location.replace('/')
    }
    const msg = data.error || `Request failed (${res.status})`
    throw new Error(msg)
  }

  return data
}

// ── Auth ──────────────────────────────────────────────
export const authAPI = {
  signup: (body) => api('/auth/signup', { method: 'POST', body: JSON.stringify(body) }),
  login: (body) => api('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  forgotPassword: (body) => api('/auth/forgot-password', { method: 'POST', body: JSON.stringify(body) }),
  resetPassword: (body) => api('/auth/reset-password', { method: 'POST', body: JSON.stringify(body) }),
}

// ── Profile ───────────────────────────────────────────
export const profileAPI = {
  get: (id) => api(`/profile/${id}`),
  update: (body) => api('/profile', { method: 'PATCH', body: JSON.stringify(body) }),
  uploadCv: (id, formData) => api(`/profile/${id}/upload-cv`, { method: 'POST', body: formData }),
  analyze: (id) => api(`/profile/${id}/analyze`, { method: 'POST' }),
  matchScholarships: (id) => api(`/profile/${id}/match-scholarships`, { method: 'POST' }),
  getMatches: (id) => api(`/profile/${id}/matches`),
  getOverview: (id) => api(`/profile/${id}/overview`),
}

// ── Smart Agent ───────────────────────────────────────
export const smartAgentAPI = {
  match: (profileId) => api('/smart-agent/match', { method: 'POST', body: JSON.stringify({ profileId }) }),
}

// ── Scholarships ──────────────────────────────────────
export const scholarshipsAPI = {
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return api(`/scholarships${qs ? `?${qs}` : ''}`)
  },
  get: (id) => api(`/scholarships/${id}`),
  pendingReview: () => api('/scholarships/pending/review'),
  scrapeCountry: (country) => api('/scholarships/scrape-country', { method: 'POST', body: JSON.stringify({ country }) }),
}

// ── Universities ──────────────────────────────────────
export const universitiesAPI = {
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return api(`/universities${qs ? `?${qs}` : ''}`)
  },
  get: (id) => api(`/universities/${id}`),
  topMatch: (profileId) => api(`/universities/top-match/${profileId}`),
}

// ── Shortlist ─────────────────────────────────────────
export const shortlistAPI = {
  add: (body) => api('/shortlist', { method: 'POST', body: JSON.stringify(body) }),
  remove: (id) => api(`/shortlist/${id}`, { method: 'DELETE' }),
  get: (profileId) => api(`/shortlist/${profileId}`),
}

// ── Applications ──────────────────────────────────────
export const applicationsAPI = {
  create: (body) => api('/applications', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => api(`/applications/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  get: (profileId) => api(`/applications/${profileId}`),
  remove: (id) => api(`/applications/${id}`, { method: 'DELETE' }),
}

// ── Chat ──────────────────────────────────────────────
export const chatAPI = {
  send: (message) => api('/chat', { method: 'POST', body: JSON.stringify({ message }) }),

  /**
   * Stream a chat response chunk-by-chunk.
   * @param {string} message - User message
   * @param {AbortSignal} signal - AbortController signal
   * @param {(chunk: string) => void} onChunk - Called for each text chunk
   * @returns {Promise<string>} Complete response text
   */
  sendStream: async (message, signal, onChunk) => {
    const token = getToken()
    const headers = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`

    const res = await fetch(`${BASE}/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message }),
      signal,
    })

    if (!res.ok) {
      const contentType = res.headers.get('content-type') || ''
      let errMsg = `Chat request failed (${res.status})`
      if (contentType.includes('application/json')) {
        try { const d = await res.json(); errMsg = d.error || errMsg } catch {}
      }
      throw new Error(errMsg)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let full = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const text = decoder.decode(value, { stream: true })
      full += text
      onChunk(text)
    }

    return full
  },
}

// ── Attestation ───────────────────────────────────────
export const attestationAPI = {
  getGuide: (authority) => api(`/attestation/${authority}`),
  initSteps: (authority, profileId) => api(`/attestation/${authority}/init/${profileId}`, { method: 'POST' }),
  getSteps: (profileId) => api(`/attestation/profile/${profileId}`),
  completeStep: (id) => api(`/attestation/${id}/complete`, { method: 'PATCH' }),
}

// ── Documents ─────────────────────────────────────────
export const documentsAPI = {
  convertCv: (formData) => api('/documents/cv/convert', { method: 'POST', body: formData }),
  generateLetter: (formData) => api('/documents/letter/generate', { method: 'POST', body: formData }),
}

// ── Language Prep ─────────────────────────────────────
export const languagePrepAPI = {
  getGuide: (testType) => api(`/language-prep/${testType}`),
  getProfilePrep: (profileId) => api(`/language-prep/profile/${profileId}`),
}

// ── Notifications ─────────────────────────────────────
export const notificationsAPI = {
  get: (profileId) => api(`/notifications/${profileId}`),
  markRead: (id) => api(`/notifications/${id}/read`, { method: 'PATCH' }),
  checkDeadlines: (profileId) => api(`/notifications/check-deadlines/${profileId}`, { method: 'POST' }),
}

// ── Roadmap ───────────────────────────────────────────
export const roadmapAPI = {
  get: (profileId) => api(`/roadmap/${profileId}`),
}

// ── Health ────────────────────────────────────────────
export const healthAPI = {
  check: () => api('/health'),
}
