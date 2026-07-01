import { useState, useRef, useEffect } from 'react'

// Reusable chat window: scrolling message list + input row.
export default function Chat({ title = 'CHAT', messages, onSend }) {
  const [text, setText] = useState('')
  const scrollRef = useRef(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  const submit = (e) => {
    e.preventDefault()
    onSend?.(text)
    setText('')
  }

  return (
    <div className="panel col" style={{ height: '100%' }}>
      <div className="panel-header">{title}</div>
      <div ref={scrollRef} className="grow" style={{ overflowY: 'auto', padding: '10px 12px' }}>
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 8, lineHeight: 1.2 }}>
            <span style={{ color: m.color || 'var(--gold-bright)' }}>{m.who}:</span>{' '}
            <span style={{ color: 'var(--text)' }}>{m.text}</span>
          </div>
        ))}
      </div>
      {onSend && (
        <form onSubmit={submit} className="row gap-sm" style={{ padding: 10, borderTop: '2px solid var(--panel-line)' }}>
          <input
            type="text"
            className="grow"
            placeholder="Say something…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button type="submit" className="btn small">Send</button>
        </form>
      )}
    </div>
  )
}
