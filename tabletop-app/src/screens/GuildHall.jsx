import { useState, useEffect, useCallback } from 'react'
import Cabinet, { RailBtn } from '../components/Cabinet.jsx'
import Sprite from '../components/Sprite.jsx'
import { CLASSES } from '../data/classes.js'
import { COLLECTION, diceUrl } from '../data/dice.js'
import { api, signOut } from '../api.js'

// The Adventurer's Guild Hall (home) — laid out inside the full-screen wooden
// cabinet to mirror homepage.png. All data comes from the AWS Blocks backend:
// listGames / getConstants / createGame / joinPrivate.
export default function GuildHall({ character, onOpenGame }) {
  const [games, setGames] = useState([])
  const [scenarios, setScenarios] = useState([])
  const [dmTypes, setDmTypes] = useState([])
  const [scenario, setScenario] = useState('')
  const [dm, setDm] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [fillMode, setFillMode] = useState('ai') // 'ai' | 'humans'
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // After creating a private game the server returns its access code; hold it
  // (with the new game id) so we can show it in a dialog before entering.
  const [created, setCreated] = useState(null) // { gameId, accessCode }

  const refresh = useCallback(async () => {
    try {
      setGames(await api.listGames())
    } catch (e) {
      setError(e?.message || 'Could not load games.')
    }
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        const c = await api.getConstants()
        setScenarios(c.scenarios)
        setDmTypes(c.dmTypes)
        setScenario(c.scenarios[0])
        setDm(c.dmTypes[0])
      } catch { /* ignore */ }
      refresh()
    })()
  }, [refresh])

  const launch = async () => {
    setBusy(true)
    setError('')
    try {
      const { gameId, accessCode } = await api.createGame({ scenario, dmType: dm, isPublic, fillMode })
      // Private game → reveal its shareable access code first; the host enters
      // from the dialog. Public game → jump straight in as before.
      if (!isPublic && accessCode) setCreated({ gameId, accessCode })
      else onOpenGame(gameId)
    } catch (e) {
      setError(e?.message || 'Could not create game.')
    } finally {
      setBusy(false)
    }
  }

  const joinPrivate = async () => {
    if (!code.trim()) return
    setError('')
    try {
      const { gameId } = await api.joinPrivate(code.trim())
      onOpenGame(gameId)
    } catch (e) {
      setError(e?.message || 'No game for that code.')
    }
  }

  const cls = CLASSES[character.classKey]

  const left = (<><RailBtn title="Sign Out" onClick={signOut}>⎋</RailBtn></>)
  const right = (
    <>
      <div>
        <RailBtn title={character.name}>
          <Sprite src={character.sprite} alt="you" style={{ height: 30, width: 'auto' }} />
        </RailBtn>
        <RailBtn title="Refresh games" onClick={refresh}>⟳</RailBtn>
      </div>
      <span />
    </>
  )

  return (
    <Cabinet leftRail={left} rightRail={right}>
      <div className="col guild-layout" style={{ height: '100%', gap: 10 }}>
        {/* Title banner — real ornate plaque art from the design sheet */}
        <div className="col center" style={{ flex: '0 0 auto' }}>
          <Sprite
            src="/ui/title_banner.png"
            alt="Adventurer's Guild Hall"
            fallbackLabel="ADVENTURER'S GUILD HALL"
            style={{ height: 52, width: 'auto', maxWidth: '100%' }}
          />
          <div
            className="meta"
            style={{
              marginTop: -6, fontSize: 17, background: '#1a1c2e',
              border: '2px solid var(--panel-line)', borderRadius: 14, padding: '2px 14px',
            }}
          >
            Signed in as <span style={{ color: cls?.hex }}>{character.name}</span> · {cls?.name}
          </div>
        </div>

        {error && <div style={{ color: '#ff6b6b', fontSize: 17, textAlign: 'center' }}>⚠ {error}</div>}

        {/* Two columns: game list | create */}
        <div className="row gap grow guild-main" style={{ alignItems: 'stretch', minHeight: 0 }}>
          {/* PUBLIC GAME LIST */}
          <div className="panel col guild-list-panel" style={{ flex: '1.5' }}>
            <div className="panel-header">PUBLIC GAME LIST</div>
            <div className="grow" style={{ overflowY: 'auto', padding: 10 }}>
              {games.length === 0 ? (
                <p className="dim" style={{ textAlign: 'center', fontSize: 19, padding: 20 }}>
                  No public games yet. Launch a new adventure →
                </p>
              ) : (
                games.map((g) => <GameCard key={g.id} game={g} onJoin={() => onOpenGame(g.id)} />)
              )}
            </div>
          </div>

          {/* CREATE A NEW GAME */}
          <div className="panel col guild-create-panel" style={{ flex: '1' }}>
            <div className="panel-header">CREATE A NEW GAME</div>
            <div className="col grow" style={{ padding: 14, overflowY: 'auto' }}>
              <div className="field">
                <label>Scenario Theme</label>
                <select value={scenario} onChange={(e) => setScenario(e.target.value)}>
                  {scenarios.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="field">
                <label>AI DM Type</label>
                <select value={dm} onChange={(e) => setDm(e.target.value)}>
                  {dmTypes.map((d) => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Party Seats</label>
                <div className="col gap-sm">
                  <label className="row gap-sm" style={{ alignItems: 'center', fontSize: 19, cursor: 'pointer' }}>
                    <input type="radio" name="fill" checked={fillMode === 'ai'} onChange={() => setFillMode('ai')} style={{ width: 16, height: 16 }} />
                    <span className="meta">Fill with AI companions — start now</span>
                  </label>
                  <label className="row gap-sm" style={{ alignItems: 'center', fontSize: 19, cursor: 'pointer' }}>
                    <input type="radio" name="fill" checked={fillMode === 'humans'} onChange={() => setFillMode('humans')} style={{ width: 16, height: 16 }} />
                    <span className="meta">Wait for other players to join</span>
                  </label>
                </div>
              </div>
              <label className="row gap-sm" style={{ alignItems: 'center', margin: '2px 0 14px', fontSize: 20, cursor: 'pointer' }}>
                <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} style={{ width: 18, height: 18 }} />
                <span className="meta">Open to Public?</span>
              </label>
              <button className="btn" onClick={launch} disabled={busy} style={{ fontSize: 13 }}>
                {busy ? 'LAUNCHING…' : '🔥 LAUNCH NEW ADVENTURE'}
              </button>

              <div className="panel" style={{ marginTop: 16 }}>
                <div className="panel-header">JOIN PRIVATE GAME</div>
                <div className="row gap-sm" style={{ padding: 12 }}>
                  <input type="text" className="grow" placeholder="Access Code" value={code} onChange={(e) => setCode(e.target.value)} />
                  <button className="btn small btn-ghost" onClick={joinPrivate}>→</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Guild Dice Collection */}
        <div className="row guild-dice-row" style={{ justifyContent: 'flex-end', alignItems: 'flex-end', flex: '0 0 auto' }}>
          <div className="col center" style={{ gap: 2 }}>
            <div className="row gap-sm" style={{ alignItems: 'flex-end' }}>
              {COLLECTION.map((d, i) => (
                <Sprite key={i} src={diceUrl(d.color, d.n)} alt="die" style={{ height: 30 + i * 8, width: 'auto', filter: 'drop-shadow(0 0 6px #dfa13b88)' }} />
              ))}
            </div>
            <span className="dim" style={{ fontSize: 15 }}>Guild Dice Collection</span>
          </div>
        </div>
      </div>

      {/* ACCESS CODE DIALOG — reveals the shareable code for a new private game */}
      {created && (
        <AccessCodeDialog
          code={created.accessCode}
          onEnter={() => onOpenGame(created.gameId)}
        />
      )}
    </Cabinet>
  )
}

// Themed modal that reveals a new private game's access code. Mirrors the
// "TIME'S UP" game-over dialog design so the two feel like one family.
function AccessCodeDialog({ code, onEnter }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard unavailable — the code is shown for manual copy */ }
  }
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: '#0a061699', backdropFilter: 'blur(2px)',
      }}
    >
      <div
        className="panel col center"
        style={{
          width: 'min(460px, 92vw)', padding: '28px 26px', gap: 14, textAlign: 'center',
          border: '3px solid var(--gold)', boxShadow: '0 0 40px #000, 0 0 24px var(--dm)',
        }}
      >
        <Sprite src="/ui/crest.png" alt="crest" style={{ height: 84, width: 'auto', filter: 'drop-shadow(0 0 12px #00ffff55)' }} />
        <h1 className="head" style={{ fontSize: 22, color: 'var(--gold-bright)' }}>PRIVATE GAME READY</h1>
        <p className="meta" style={{ fontSize: 21, lineHeight: 1.3, margin: 0 }}>
          Share this access code so other adventurers can join your party.
        </p>
        <button
          onClick={copy}
          title="Copy access code"
          className="head"
          style={{
            fontSize: 30, letterSpacing: 6, color: 'var(--gold-bright)',
            background: '#0f1120', border: '2px solid var(--gold)', borderRadius: 10,
            padding: '10px 20px', cursor: 'pointer',
          }}
        >
          {code}
        </button>
        <span className="dim" style={{ fontSize: 16, minHeight: 18 }}>
          {copied ? '✓ Copied to clipboard' : 'Tap the code to copy'}
        </span>
        <button className="btn" onClick={onEnter} style={{ marginTop: 6 }}>
          ⚔ ENTER THE GAME
        </button>
      </div>
    </div>
  )
}

function GameCard({ game, onJoin }) {
  const [showParty, setShowParty] = useState(false)
  const finished = game.finished
  const full = game.full
  const members = game.members || []
  const statusText = finished ? 'Finished' : full ? 'In Session' : 'Awaiting Players'
  const statusColor = finished ? 'var(--text-dim)' : full ? 'var(--rogue)' : 'var(--ranger)'
  return (
    <div className="panel game-card" style={{ padding: 12, marginBottom: 10, borderColor: 'var(--wood)', opacity: finished ? 0.7 : 1 }}>
      <div className="row between game-card-head" style={{ alignItems: 'flex-start' }}>
        <div className="grow">
          <div className="head" style={{ fontSize: 12, color: 'var(--gold-bright)', marginBottom: 6 }}>{game.name}</div>
          <div className="dim" style={{ fontSize: 16 }}>{game.note}</div>
          <div className="meta" style={{ fontSize: 18, marginTop: 4 }}>Party: {game.party}/{game.maxParty} seats filled</div>
          <div className="meta" style={{ fontSize: 18 }}>AI DM Level: {game.dmLevel}</div>
          <div style={{ fontSize: 18, marginTop: 2 }}>
            Status: <span style={{ color: statusColor }}>{statusText}</span>
          </div>
        </div>
        <div className="col gap-sm" style={{ alignItems: 'flex-end' }}>
          <div className="row" style={{ gap: 2 }}>
            {(game.partyClasses || []).map((c, i) => (
              CLASSES[c] ? <Sprite key={i} src={`/sprites/characters/${CLASSES[c].variants[0]}.png`} alt={c} style={{ height: 30, width: 'auto', opacity: members[i]?.seat === 'open' ? 0.35 : 1 }} /> : null
            ))}
          </div>
          <div className="row gap-sm">
            <button className="btn small btn-ghost" onClick={() => setShowParty((v) => !v)}>
              {showParty ? 'Hide Party' : 'View Party'}
            </button>
            {/* Finished → not joinable; open seats → Join and play; full → Watch. */}
            {finished ? (
              <button className="btn small" disabled style={{ opacity: 0.5 }}>Finished</button>
            ) : (
              <button className="btn small" onClick={onJoin}>{full ? '👁 Watch' : 'Join Game'}</button>
            )}
          </div>
        </div>
      </div>

      {/* Expandable party roster */}
      {showParty && (
        <div className="row wrap gap-sm" style={{ marginTop: 10, paddingTop: 10, borderTop: '2px solid var(--panel-line)' }}>
          {members.length === 0 ? (
            <span className="dim" style={{ fontSize: 16 }}>Party details unavailable.</span>
          ) : (
            members.map((m, i) => {
              const cls = CLASSES[m.classKey]
              const isOpen = m.seat === 'open'
              const label = isOpen ? 'Open seat' : (m.seat === 'ai' ? 'AI' : 'Player')
              return (
                <div key={i} className="row gap-sm" style={{ alignItems: 'center', background: '#0f1120', border: `2px solid ${isOpen ? 'var(--panel-line)' : (cls?.hex || 'var(--panel-line)')}`, borderRadius: 6, padding: '3px 8px', opacity: isOpen ? 0.6 : 1 }}>
                  {cls && <Sprite src={`/sprites/characters/${cls.variants[0]}.png`} alt={m.classKey} style={{ height: 22, width: 'auto', filter: isOpen ? 'grayscale(1)' : 'none' }} />}
                  <span style={{ fontSize: 16, color: isOpen ? 'var(--text-dim)' : (cls?.hex || 'var(--text)') }}>{isOpen ? cls?.name : m.name}</span>
                  <span className="dim" style={{ fontSize: 14 }}>· {label}</span>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
