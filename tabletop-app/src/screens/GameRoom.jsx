import { useState, useEffect, useCallback, useRef } from 'react'
import Cabinet, { RailBtn } from '../components/Cabinet.jsx'
import Chat from '../components/Chat.jsx'
import Sprite from '../components/Sprite.jsx'
import { CLASSES } from '../data/classes.js'
import { diceUrl } from '../data/dice.js'
import { api } from '../api.js'

const INV_ICON = { scroll: '📜', potion: '🧪', key: '🗝', gem: '💎', map: '🗺' }

// The active game table, laid out inside the wooden cabinet to mirror gamepage.png:
// turn-order rail, stone-tile dungeon board with glowing character discs, DM
// narration overlay + centered action list, chat, inventory, dice tray.
//
// All game state is authoritative on the backend. We fetch it via getState,
// subscribe to the Realtime `state` channel for live updates (from bots / other
// players), and drive turns with takeAction. Chat uses the backend + Realtime.
export default function GameRoom({ gameId, character, onLeave }) {
  const [state, setState] = useState(null)
  const [chat, setChat] = useState([])
  const [acting, setActing] = useState(false)
  const [error, setError] = useState('')

  const refreshState = useCallback(async () => {
    try {
      setState(await api.getState(gameId))
    } catch (e) {
      setError(e?.message || 'Could not load game.')
    }
  }, [gameId])

  // Initial load: claim a seat, then fetch state + chat history.
  useEffect(() => {
    ;(async () => {
      try { await api.joinGame(gameId) } catch { /* already seated or full */ }
      await refreshState()
    })()
    api.getChatHistory(gameId).then(setChat).catch(() => {})
  }, [gameId, refreshState])

  // Subscribe to live state updates (bots acting, other players).
  useEffect(() => {
    let sub
    ;(async () => {
      try {
        const channel = await api.getStateChannel(gameId)
        sub = channel.subscribe(() => refreshState())
        await sub.established
      } catch { /* realtime unavailable — polling on action still works */ }
    })()
    return () => sub?.unsubscribe()
  }, [gameId, refreshState])

  // Subscribe to live chat.
  useEffect(() => {
    let sub
    ;(async () => {
      try {
        const channel = await api.getChatChannel(gameId)
        sub = channel.subscribe((msg) =>
          // De-dupe by timestamp — guards against StrictMode double-subscribe in
          // dev and any redelivery.
          setChat((c) => (c.some((m) => m.ts === msg.ts && m.who === msg.who) ? c : [...c, msg])),
        )
        await sub.established
      } catch { /* ignore */ }
    })()
    return () => sub?.unsubscribe()
  }, [gameId])

  const act = useCallback(async (action) => {
    setActing(true)
    setError('')
    try {
      setState(await api.takeAction(gameId, action))
    } catch (e) {
      setError(e?.message || 'Action failed.')
    } finally {
      setActing(false)
    }
  }, [gameId])

  const sendChat = useCallback(async (text) => {
    if (!text.trim()) return
    try { await api.sendChat(gameId, text) } catch { /* ignore */ }
  }, [gameId])

  const left = (
    <>
      <RailBtn title="Leave Table" onClick={onLeave}>⎋</RailBtn>
      <RailBtn title="Help">?</RailBtn>
    </>
  )
  const right = (
    <>
      <div>
        <RailBtn title={character.name}>
          <Sprite src={character.sprite} alt="you" style={{ height: 30, width: 'auto' }} />
        </RailBtn>
        <RailBtn title="Party">☰</RailBtn>
        <RailBtn title="Refresh" onClick={refreshState}>⟳</RailBtn>
      </div>
      <span />
    </>
  )

  if (!state) {
    return (
      <Cabinet leftRail={left} rightRail={right}>
        <div className="col center" style={{ height: '100%', color: 'var(--text-meta)', fontSize: 22 }}>
          {error ? <span style={{ color: '#ff6b6b' }}>⚠ {error}</span> : 'Entering the dungeon…'}
        </div>
      </Cabinet>
    )
  }

  const me = state.players.find((p) => p.userId === character.userId) || state.players[0]
  const current = state.players[state.turnIndex]
  const isMyTurn = state.phase === 'player' && current?.id === me.id && !acting
  const myClass = CLASSES[me.classKey]
  const dmActive = state.phase !== 'player'

  return (
    <Cabinet leftRail={left} rightRail={right}>
      <div className="row gap" style={{ height: '100%', alignItems: 'stretch' }}>
        {/* TURN ORDER */}
        <div className="panel col" style={{ flex: '0 0 200px' }}>
          <div className="panel-header">TURN ORDER</div>
          <div className="col grow" style={{ padding: 10, gap: 10, overflowY: 'auto' }}>
            {state.players.map((p, i) => (
              <TurnChip key={p.id} p={p} n={i + 1} active={state.turnIndex === i && state.phase === 'player'} />
            ))}
            <DMTurnChip active={dmActive} />
          </div>
        </div>

        {/* CENTER: board (with AI DM tab + narration overlay) */}
        <div className="col grow" style={{ minWidth: 0 }}>
          <Board
            players={state.players}
            activeIndex={state.phase === 'player' ? state.turnIndex : -1}
            dmName={state.dmName}
            dmActive={dmActive}
            narration={lastDm(state)}
            actions={myClass?.actions || []}
            enabled={isMyTurn}
            onAct={act}
            phase={acting ? 'resolving' : state.phase}
            current={current}
          />
        </div>

        {/* RIGHT: chat + inventory + dice */}
        <div className="col gap" style={{ flex: '0 0 260px' }}>
          <div className="grow" style={{ display: 'flex', minHeight: 0 }}>
            <Chat title="CHAT" messages={chat} onSend={sendChat} />
          </div>

          <div className="panel" style={{ flex: '0 0 auto' }}>
            <div className="panel-header">INVENTORY</div>
            <div className="row" style={{ gap: 6, padding: 10, alignItems: 'center' }}>
              <div className="row wrap grow" style={{ gap: 6 }}>
                {state.inventory.map((it, i) => (
                  <div key={i} title={it} style={{ width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, background: '#0f1120', border: '2px solid var(--panel-line)', borderRadius: 6 }}>
                    {INV_ICON[it] || '▪'}
                  </div>
                ))}
              </div>
              <DiceCluster roll={state.lastRoll} />
            </div>
          </div>
        </div>
      </div>
    </Cabinet>
  )
}

const lastDm = (state) => [...state.log].reverse().find((l) => l.kind === 'dm')?.text

/* ---------------------------------------------------------------- turn order */
function TurnChip({ p, n, active }) {
  return (
    <div className="row gap-sm" style={{ alignItems: 'center', padding: 6, borderRadius: 8, background: active ? '#0f1120' : 'transparent', border: `2px solid ${active ? p.color : 'transparent'}`, boxShadow: active ? `0 0 14px ${p.color}` : 'none' }}>
      <Ring color={p.color} active={active} size={44}>
        <Sprite src={p.sprite} alt={p.name} style={{ height: 34, width: 'auto' }} />
      </Ring>
      <div className="col" style={{ gap: 0 }}>
        <span style={{ fontSize: 18, color: p.color }}>{n}: {p.name}</span>
        <span className="dim" style={{ fontSize: 14 }}>{CLASSES[p.classKey].name}{p.isHuman ? ' (you)' : ''}</span>
      </div>
    </div>
  )
}

function DMTurnChip({ active }) {
  return (
    <div className="row gap-sm" style={{ alignItems: 'center', padding: 6, borderRadius: 8, marginTop: 4, borderTop: '2px dashed var(--panel-line)', background: active ? '#0f1120' : 'transparent', boxShadow: active ? '0 0 14px var(--dm)' : 'none' }}>
      <Ring color="var(--dm)" active={active} size={44}><span style={{ fontSize: 22 }}>💀</span></Ring>
      <span style={{ fontSize: 18, color: 'var(--dm)' }}>AI DM</span>
    </div>
  )
}

function Ring({ color, active, size = 44, children }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f1120', border: `3px solid ${color}`, color, animation: active ? 'pulseGlow 1.2s ease-in-out infinite' : 'none', overflow: 'hidden' }}>
      {children}
    </div>
  )
}

/* ---------------------------------------------------------------------- board */
function Board({ players, activeIndex, dmName, dmActive, narration, actions, enabled, onAct, phase, current }) {
  // Four token slots in a 2x2 arrangement (percent of board).
  const SLOTS = [
    { left: '27%', top: '32%' },
    { left: '73%', top: '32%' },
    { left: '27%', top: '78%' },
    { left: '73%', top: '78%' },
  ]
  return (
    <div
      className="col"
      style={{
        position: 'relative', flex: 1, minHeight: 0, borderRadius: 8,
        border: '3px solid #0a0d18',
        // stone-tile dungeon floor from the design art, tiled, darkened at edges
        background:
          'radial-gradient(120% 120% at 50% 40%, transparent 55%, #0a0616 100%),' +
          "url('/ui/floor_tile.png')",
        backgroundSize: 'cover, 132px 132px',
        boxShadow: 'inset 0 0 70px #000',
        overflow: 'hidden',
      }}
    >
      {/* eerie ghost-flame glow at the edges */}
      <div style={{ position: 'absolute', inset: 0, boxShadow: 'inset 0 0 50px #39ff1418, inset 0 0 90px #9d4edd33', pointerEvents: 'none' }} />

      {/* AI DM tab centered at the very top of the board */}
      <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 5 }}>
        <DMBadge name={dmName} active={dmActive} />
      </div>

      {/* character discs — confined to the upper play area so they never collide
          with the narration overlay pinned at the bottom */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: '38%' }}>
        {players.map((p, i) => (
          <Token key={p.id} p={p} pos={SLOTS[p.slot] || SLOTS[i]} active={activeIndex === i} />
        ))}
      </div>

      {/* narration overlay + action menu pinned to the board bottom */}
      <div style={{ marginTop: 'auto', position: 'relative', zIndex: 4, padding: 12 }}>
        <div
          style={{
            background: '#12142ee6', border: '2px solid var(--panel-line)', borderRadius: 8,
            padding: '10px 14px', boxShadow: '0 4px 14px #000a',
          }}
        >
          <div style={{ fontSize: 21, lineHeight: 1.25 }}>
            <span className="head" style={{ fontSize: 11, color: 'var(--ranger)' }}>DM {dmName}:</span>{' '}
            <span style={{ color: 'var(--text)' }}>{narration}</span>
          </div>
        </div>
        <ActionMenu actions={actions} enabled={enabled} onAct={onAct} phase={phase} current={current} />
      </div>
    </div>
  )
}

function Token({ p, pos, active }) {
  const abilities = CLASSES[p.classKey].abilities || []
  const hpPct = Math.max(0, Math.min(100, (p.hp / 20) * 100))
  return (
    <div style={{ position: 'absolute', left: pos.left, top: pos.top, transform: 'translate(-50%,-50%)', display: 'flex', alignItems: 'center', gap: 6 }}>
      {/* ability icons stacked to the left */}
      <div className="col" style={{ gap: 4 }}>
        {abilities.map((a, i) => (
          <div key={i} style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, background: '#0f1120dd', border: `2px solid ${p.color}`, borderRadius: 6, boxShadow: `0 0 6px ${p.color}55` }}>{a}</div>
        ))}
      </div>

      {/* glowing circular disc with the character + nameplate + HP bar */}
      <div className="col center" style={{ position: 'relative' }}>
        <div
          style={{
            width: 92, height: 92, borderRadius: '50%',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            background: `radial-gradient(circle at 50% 40%, ${p.color}44, ${p.color}18 60%, #0a0616 100%)`,
            border: `4px solid ${p.color}`,
            boxShadow: active ? `0 0 26px ${p.color}, inset 0 0 18px ${p.color}66` : `0 0 10px ${p.color}88, inset 0 0 14px ${p.color}44`,
            animation: active ? 'pulseGlow 1.2s ease-in-out infinite' : 'none',
            color: p.color, overflow: 'hidden',
          }}
        >
          <Sprite src={p.sprite} alt={p.name} style={{ height: 78, width: 'auto', marginBottom: -4 }} />
        </div>
        {/* nameplate + HP bar overlapping the bottom of the disc */}
        <div style={{ marginTop: -10, minWidth: 88, zIndex: 2 }}>
          <div style={{ fontSize: 16, textAlign: 'center', color: 'var(--text)', background: '#0a0d18', border: `2px solid ${p.color}`, borderRadius: 5, padding: '0 8px' }}>{p.name}</div>
          <div style={{ height: 7, background: '#2a0d10', border: '1px solid #000', borderRadius: 3, marginTop: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${hpPct}%`, background: 'linear-gradient(90deg,#ff3b3b,#c81e1e)' }} />
          </div>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------- actions */
function ActionMenu({ actions, enabled, onAct, phase, current }) {
  if (phase === 'resolving') {
    return <div className="meta center" style={{ display: 'flex', fontSize: 20, padding: '10px 0' }}>Resolving the roll…</div>
  }
  if (!enabled) {
    return (
      <div className="meta center" style={{ display: 'flex', fontSize: 20, padding: '10px 0' }}>
        {current ? `Waiting for ${current.name} to act…` : 'The Dungeon Master is speaking…'}
      </div>
    )
  }
  return (
    <div className="col center" style={{ gap: 6, marginTop: 8 }}>
      {actions.map((a, i) => (
        <button
          key={a}
          onClick={() => onAct(a)}
          style={{
            width: 'min(420px, 92%)', textAlign: 'center', cursor: 'pointer',
            fontFamily: 'var(--font-body)', fontSize: 21, color: 'var(--text)',
            padding: '8px 12px', borderRadius: 6,
            background: i === 0 ? 'linear-gradient(180deg,#2b2f52,#1b1e36)' : 'linear-gradient(180deg,#232640,#191b30)',
            border: `2px solid ${i === 0 ? 'var(--gold)' : 'var(--panel-line)'}`,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--gold)')}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = i === 0 ? 'var(--gold)' : 'var(--panel-line)')}
        >
          {a}
        </button>
      ))}
    </div>
  )
}

/* --------------------------------------------------------------------- dice */
// Large overlapping d20s tucked bottom-right, matching the design.
function DiceCluster({ roll }) {
  const redN = roll && roll.color === 'red' ? roll.sprite : 24
  const blueN = roll && roll.color === 'blue' ? roll.sprite : 20
  const glow = roll ? (roll.success ? 'var(--rogue)' : 'var(--ranger)') : '#dfa13b88'
  return (
    <div style={{ position: 'relative', width: 84, height: 60, flex: '0 0 auto' }} title={roll ? `${roll.actor}: ${roll.value} vs DC ${roll.dc}` : 'dice'}>
      <Sprite src={diceUrl('red', redN)} alt="d20" style={{ position: 'absolute', left: 0, top: 0, height: 46, filter: `drop-shadow(0 0 8px ${roll?.color === 'red' ? glow : '#00000088'})` }} />
      <Sprite src={diceUrl('blue', blueN)} alt="d20" style={{ position: 'absolute', right: 0, bottom: 0, height: 46, filter: `drop-shadow(0 0 8px ${roll?.color === 'blue' ? glow : '#00000088'})` }} />
      {roll && (
        <span style={{ position: 'absolute', top: -8, right: -6, fontFamily: 'var(--font-head)', fontSize: 11, color: glow, textShadow: '0 1px 2px #000' }}>{roll.value}</span>
      )}
    </div>
  )
}

function DMBadge({ name, active }) {
  return (
    <div className="row gap-sm" style={{ alignItems: 'center', padding: '5px 14px', borderRadius: 20, background: '#0f1120ee', border: '2px solid var(--dm)', boxShadow: active ? '0 0 18px var(--dm)' : '0 2px 6px #000a', color: 'var(--dm)' }}>
      <span style={{ fontSize: 18, filter: 'drop-shadow(0 0 6px var(--dm-flame))' }}>💀</span>
      <span className="head" style={{ fontSize: 11 }}>AI DM: {name}</span>
    </div>
  )
}
