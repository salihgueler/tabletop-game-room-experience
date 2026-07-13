import { useState, useRef, useEffect } from 'react'

// One transcript line, styled by its kind so the history reads clearly:
// DM narration, chosen actions, dice rolls, spoken lines, and system notes.
function ChatLine({ m }) {
  const kind = m.kind || 'say'
  if (kind === 'dm') {
    return (
      <div style={{ marginBottom: 8, lineHeight: 1.25, borderLeft: '2px solid var(--dm)', paddingLeft: 8 }}>
        <span className="head" style={{ fontSize: 10, color: 'var(--dm)' }}>DM</span>{' '}
        <span style={{ color: 'var(--text)', fontStyle: 'italic' }}>{m.text}</span>
      </div>
    )
  }
  if (kind === 'roll') {
    return (
      <div style={{ marginBottom: 8, lineHeight: 1.2, color: m.color || 'var(--gold-bright)', fontWeight: 'bold' }}>
        {m.who}: {m.text}
      </div>
    )
  }
  if (kind === 'action') {
    return (
      <div style={{ marginBottom: 8, lineHeight: 1.2, color: 'var(--text-meta)' }}>
        ▸ <span style={{ color: m.color }}>{m.who}</span> {m.text.replace(`${m.who} chooses `, '→ ')}
      </div>
    )
  }
  if (kind === 'system') {
    return <div style={{ marginBottom: 8, lineHeight: 1.2, color: 'var(--text-dim)', fontStyle: 'italic' }}>{m.text}</div>
  }
  // default 'say' — spoken chat / companion quip
  return (
    <div style={{ marginBottom: 8, lineHeight: 1.2 }}>
      <span style={{ color: m.color || 'var(--gold-bright)' }}>{m.who}:</span>{' '}
      <span style={{ color: 'var(--text)' }}>{m.text}</span>
    </div>
  )
}

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
    <div className="panel col chat-panel" style={{ height: '100%' }}>
      <div className="panel-header">{title}</div>
      <div ref={scrollRef} className="grow" style={{ overflowY: 'auto', padding: '10px 12px' }}>
        {messages.map((m, i) => <ChatLine key={m.ts ?? i} m={m} />)}
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
