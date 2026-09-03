import { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from './UI'
import { chatAPI } from '../api'

function cleanAssistantText(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line
      .replace(/^\s*#{1,6}\s*/, '')
      .replace(/^\s*(?:[*-])\s+/, '• ')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/__(.*?)__/g, '$1')
      .replace(/\*([^*\n]+)\*/g, '$1')
      .replace(/`([^`\n]+)`/g, '$1'))
    .join('\n')
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([
    {
      id: 1,
      from: 'ai',
      text: "Assalamu Alaikum! I'm your ScholarPath AI assistant. Aap scholarships, universities, ya applications ke baare mein kuch bhi pooch sakte hain. Kya madad chahiye aaj?",
    },
  ])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const bottomRef = useRef(null)
  const abortRef = useRef(null)
  const streamIdRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streaming])

  const handleSend = useCallback(async (e) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || streaming) return

    const userMsg = { id: Date.now(), from: 'user', text }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setStreaming(true)

    // Placeholder AI message that will be filled chunk-by-chunk
    const aiMsgId = Date.now() + 1
    streamIdRef.current = aiMsgId
    setMessages((prev) => [...prev, { id: aiMsgId, from: 'ai', text: '' }])

    const controller = new AbortController()
    abortRef.current = controller

    try {
      await chatAPI.sendStream(text, controller.signal, (chunk) => {
        // Only update the current streaming message
        setMessages((prev) =>
          prev.map((m) =>
            m.id === streamIdRef.current ? { ...m, text: m.text + chunk } : m
          )
        )
      })
    } catch (err) {
      if (err.name !== 'AbortError') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === streamIdRef.current
              ? { ...m, text: m.text || 'Sorry, I could not connect to the server. Please try again later.' }
              : m
          )
        )
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
      streamIdRef.current = null
    }
  }, [input, streaming])

  function handleClose() {
    if (abortRef.current) abortRef.current.abort()
    setOpen(false)
  }

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {open && (
        <div className="mb-3 w-80 max-w-[calc(100vw-2.5rem)] bg-white border border-sp-border rounded-2xl shadow-card-lg flex flex-col overflow-hidden">
          <div className="bg-sp-blue px-4 py-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-white">ScholarPath Assistant</span>
            <button
              onClick={handleClose}
              aria-label="Close chat"
              className="text-white/80 hover:text-white text-lg leading-none"
            >
              &times;
            </button>
          </div>

          <div className="flex-1 max-h-80 overflow-y-auto px-4 py-3 space-y-3">
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.from === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`text-sm rounded-xl px-3 py-2 max-w-[85%] whitespace-pre-wrap break-words ${
                    m.from === 'user'
                      ? 'bg-sp-blue text-white'
                      : 'bg-sp-bg text-sp-navy border border-sp-border'
                  }`}
                >
                  {m.text ? (m.from === 'ai' ? cleanAssistantText(m.text) : m.text) : (m.from === 'ai' && streaming && m.id === streamIdRef.current ? (
                    <span className="inline-flex gap-1">
                      <span className="animate-pulse">•</span>
                      <span className="animate-pulse" style={{ animationDelay: '0.15s' }}>•</span>
                      <span className="animate-pulse" style={{ animationDelay: '0.3s' }}>•</span>
                    </span>
                  ) : null)}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <form onSubmit={handleSend} className="border-t border-sp-border p-3 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask in Urdu or English..."
              disabled={streaming}
              className="flex-1 text-sm border border-sp-border rounded-lg px-3 py-2 focus:outline-none focus:border-sp-blue focus:ring-1 focus:ring-sp-blue disabled:opacity-50"
            />
            <Button variant="primary" type="submit" className="px-4 py-2" disabled={streaming || !input.trim()}>
              {streaming ? (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              ) : 'Send'}
            </Button>
          </form>
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Open chat assistant"
        className="w-14 h-14 rounded-full bg-sp-blue text-white shadow-card-lg flex items-center justify-center text-2xl hover:bg-sp-blue-dark transition-colors"
      >
        {open ? '×' : '💬'}
      </button>
    </div>
  )
}
