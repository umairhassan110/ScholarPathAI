import { useState } from 'react'
import { Card } from '../components/UI'
import { faqs } from '../data/mockData'

function FaqItem({ faq, open, onToggle }) {
  return (
    <div className="border-b border-sp-border last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between text-left py-4 gap-4"
      >
        <span className="text-sm font-semibold text-sp-navy">{faq.question}</span>
        <span className={`text-sp-blue text-lg leading-none transition-transform ${open ? 'rotate-45' : ''}`}>
          +
        </span>
      </button>
      {open && <p className="text-sm text-sp-slate pb-4 pr-8">{faq.answer}</p>}
    </div>
  )
}

export default function FaqTab() {
  const [openId, setOpenId] = useState(faqs[0]?.id ?? null)

  return (
    <Card className="p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-sp-slate mb-1">
        Frequently asked questions
      </p>
      <p className="text-sm text-sp-slate mb-2">
        Can't find what you're looking for? Use the chat assistant in the corner.
      </p>
      <div>
        {faqs.map((faq) => (
          <FaqItem
            key={faq.id}
            faq={faq}
            open={openId === faq.id}
            onToggle={() => setOpenId(openId === faq.id ? null : faq.id)}
          />
        ))}
      </div>
    </Card>
  )
}
