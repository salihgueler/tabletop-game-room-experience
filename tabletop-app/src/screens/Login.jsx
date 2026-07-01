import { useState } from 'react'
import Frame from '../components/Frame.jsx'
import Sprite from '../components/Sprite.jsx'
import { ALL_CHARACTERS, CLASSES } from '../data/classes.js'

// Login + character select. Name entry and a grid of the 20 character sprites.
export default function Login({ onEnter }) {
  const [name, setName] = useState('')
  const [picked, setPicked] = useState(null)

  const canEnter = name.trim().length >= 2 && picked

  const enter = () => {
    if (!canEnter) return
    onEnter({ name: name.trim(), classKey: picked.classKey, sprite: picked.sprite, id: picked.id })
  }

  const pickedClass = picked ? CLASSES[picked.classKey] : null

  return (
    <div className="col center" style={{ height: '100vh', padding: 24, gap: 18, overflowY: 'auto' }}>
      <h1 style={{ fontSize: 26, textAlign: 'center' }}>ADVENTURER'S GUILD HALL</h1>
      <p className="meta" style={{ fontSize: 22, marginTop: -6 }}>Forge your hero and take a seat at the table.</p>

      <Frame style={{ width: 'min(920px, 96vw)' }} innerStyle={{ padding: 20 }}>
        <div className="row gap" style={{ flexWrap: 'wrap' }}>
          {/* left: name + selected preview */}
          <div className="col gap" style={{ width: 260, flex: '0 0 auto' }}>
            <div className="field">
              <label>Adventurer Name</label>
              <input
                type="text"
                value={name}
                maxLength={18}
                placeholder="e.g. Aldric"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && enter()}
              />
            </div>

            <div className="panel col center" style={{ padding: 16, minHeight: 220 }}>
              {picked ? (
                <>
                  <div
                    style={{
                      padding: 12,
                      borderRadius: 8,
                      background: '#0f1120',
                      boxShadow: `0 0 22px ${pickedClass.hex}66`,
                      border: `2px solid ${pickedClass.hex}`,
                    }}
                  >
                    <Sprite src={picked.sprite} alt={picked.label} style={{ width: 96, height: 'auto' }} />
                  </div>
                  <div className="head" style={{ fontSize: 12, marginTop: 12, color: pickedClass.hex }}>
                    {picked.label}
                  </div>
                  <p className="meta" style={{ textAlign: 'center', fontSize: 18, marginTop: 6 }}>
                    {pickedClass.blurb}
                  </p>
                </>
              ) : (
                <p className="dim" style={{ textAlign: 'center', fontSize: 20 }}>
                  Choose a character →
                </p>
              )}
            </div>

            <button className="btn" disabled={!canEnter} onClick={enter}>
              ENTER GUILD HALL
            </button>
          </div>

          {/* right: 20 character grid */}
          <div className="grow">
            <div className="panel-header" style={{ borderRadius: 6, marginBottom: 10 }}>
              CHOOSE YOUR CHARACTER
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(5, 1fr)',
                gap: 8,
              }}
            >
              {ALL_CHARACTERS.map((c) => {
                const cls = CLASSES[c.classKey]
                const active = picked?.id === c.id
                return (
                  <button
                    key={c.id}
                    onClick={() => setPicked(c)}
                    title={c.label}
                    style={{
                      cursor: 'pointer',
                      background: active ? '#0f1120' : '#12142485',
                      border: `2px solid ${active ? cls.hex : 'var(--panel-line)'}`,
                      borderRadius: 8,
                      padding: 6,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 4,
                      boxShadow: active ? `0 0 14px ${cls.hex}88` : 'none',
                      transition: 'border-color .1s, box-shadow .1s',
                    }}
                  >
                    <Sprite src={c.sprite} alt={c.label} style={{ height: 64, width: 'auto' }} />
                    <span style={{ fontSize: 15, color: active ? cls.hex : 'var(--text-meta)' }}>
                      {c.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </Frame>
    </div>
  )
}
