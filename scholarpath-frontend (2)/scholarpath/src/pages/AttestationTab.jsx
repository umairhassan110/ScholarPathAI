import { useState, useEffect } from 'react'
import { Card, Button, Badge } from '../components/UI'
import { attestationOptions } from '../data/mockData'
import { attestationAPI } from '../api'

function OptionPicker({ options, activeId, onSelect }) {
  return (
    <div className="grid sm:grid-cols-3 gap-4 mb-6">
      {options.map((opt) => (
        <button
          key={opt.id}
          onClick={() => onSelect(opt.id)}
          className={`text-left p-4 rounded-xl border transition-colors ${
            activeId === opt.id
              ? 'border-sp-blue bg-sp-blue-light'
              : 'border-sp-border bg-white hover:border-sp-blue'
          }`}
        >
          <p className="font-bold text-sp-navy mb-1">{opt.name}</p>
          <p className="text-xs text-sp-slate">{opt.fullName}</p>
        </button>
      ))}
    </div>
  )
}

function AttestationDetail({ option, trackedSteps, onInit, onToggleStep, userId, loading }) {
  const steps = trackedSteps.length > 0 ? trackedSteps : option.steps.map((s, i) => ({
    id: null,
    step_order: i + 1,
    step_description: typeof s === 'string' ? s : s.description || s,
    status: 'pending',
  }))

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-1">
        <p className="text-lg font-bold text-sp-navy">{option.name}</p>
        <Badge tone="blue">{option.fullName}</Badge>
      </div>
      <p className="text-sm text-sp-slate mb-5">For: {option.forDocuments}</p>

      <p className="text-xs font-semibold uppercase tracking-wide text-sp-slate mb-3">
        How to apply - step by step
      </p>
      <ol className="space-y-2 mb-6">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-3 text-sm items-start">
            <button
              onClick={() => step.id && onToggleStep(step.id)}
              disabled={!step.id}
              className={`shrink-0 w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center transition-colors ${
                step.status === 'done'
                  ? 'bg-sp-green text-white'
                  : step.id
                    ? 'bg-sp-blue-light text-sp-blue-dark hover:bg-sp-blue hover:text-white cursor-pointer'
                    : 'bg-slate-100 text-slate-400'
              }`}
            >
              {step.status === 'done' ? '✓' : step.step_order || i + 1}
            </button>
            <span className={step.status === 'done' ? 'text-sp-slate line-through' : 'text-sp-slate'}>
              {step.step_description || step.description || step}
            </span>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap gap-3">
        <a href={option.officialLink} target="_blank" rel="noopener noreferrer">
          <Button variant="primary">Go to official {option.name} portal →</Button>
        </a>
        {userId && trackedSteps.length === 0 && (
          <Button variant="secondary" onClick={onInit} disabled={loading}>
            {loading ? 'Setting up…' : 'Track my progress'}
          </Button>
        )}
      </div>
    </Card>
  )
}

export default function AttestationTab({ userId }) {
  const [activeId, setActiveId] = useState(attestationOptions[0].id)
  const [trackedSteps, setTrackedSteps] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const activeOption = attestationOptions.find((o) => o.id === activeId)

  // Load tracked steps when user/tab changes
  useEffect(() => {
    if (!userId) return
    async function load() {
      try {
        const res = await attestationAPI.getSteps(userId)
        if (res.steps) setTrackedSteps(res.steps)
      } catch { /* no tracked steps yet */ }
    }
    load()
  }, [userId])

  const filteredSteps = trackedSteps.filter(s => s.authority === activeId.toUpperCase())

  async function handleInit() {
    if (!userId || !activeOption) return
    setLoading(true)
    setError('')
    try {
      const res = await attestationAPI.initSteps(activeOption.id, userId)
      if (res.steps) {
        setTrackedSteps(prev => [...prev, ...res.steps])
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleToggleStep(stepId) {
    try {
      await attestationAPI.completeStep(stepId)
      setTrackedSteps(prev =>
        prev.map(s => s.id === stepId ? { ...s, status: 'done' } : s)
      )
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-sp-slate mb-1">
        Document attestation
      </p>
      <p className="text-sm text-sp-slate mb-5">
        Pick the attestation authority you need - each has its own guidelines and official portal.
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2.5 mb-4">
          {error}
        </div>
      )}

      <OptionPicker options={attestationOptions} activeId={activeId} onSelect={setActiveId} />
      {activeOption && (
        <AttestationDetail
          option={activeOption}
          trackedSteps={filteredSteps}
          onInit={handleInit}
          onToggleStep={handleToggleStep}
          userId={userId}
          loading={loading}
        />
      )}
    </div>
  )
}
