import { useState, useEffect, useCallback, useRef } from 'react'
import Cabinet, { RailBtn } from '../components/Cabinet.jsx'
import Chat from '../components/Chat.jsx'
import Sprite from '../components/Sprite.jsx'
import { CLASSES } from '../data/classes.js'
import { DICE_FRAMES, diceUrl } from '../data/dice.js'
import { api } from '../api.js'

const DICE_ROLL_MS = 1300

// The active game table, laid out inside the wooden cabinet to mirror gamepage.png:
// turn-order rail, stone-tile dungeon board with glowing character discs, DM
// narration overlay + centered action list, chat, and animated dice tray.
//
// All game state is authoritative on the backend. We fetch it via getState,
// subscribe to the Realtime `state` channel for live updates (from bots / other
// players), and drive turns with takeAction. Chat uses the backend + Realtime.
export default function GameRoom({ gameId, character, onLeave }) {
  const [state, setState] = useState(null)
  const [chat, setChat] = useState([])
  const [acting, setActing] = useState(false)   // human action in flight
  const [botBusy, setBotBusy] = useState(false)  // a bot turn is resolving
  const [thinking, setThinking] = useState(null) // { who, color, text } live agent reasoning
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => Date.now()) // ticks the countdown display
  const [revealedRollCount, setRevealedRollCount] = useState(0)

  useEffect(() => {
    setRevealedRollCount(0)
  }, [gameId])

  const stateRollCount = state?.log.filter((entry) => entry.kind === 'roll').length ?? 0
  useEffect(() => {
    if (state && !state.lastRoll) setRevealedRollCount(stateRollCount)
  }, [state, stateRollCount])

  const refreshState = useCallback(async () => {
    try {
      const fresh = await api.getState(gameId)
      // Version guard: never let a slower fetch overwrite a newer state we
      // already hold (e.g. our own optimistic result racing a channel refetch).
      setState((prev) => (prev && fresh.version < prev.version ? prev : fresh))
    } catch (e) {
      setError(e?.message || 'Could not load game.')
    }
  }, [gameId])

  // Initial load: try to claim a seat (no-op if full → we spectate), then fetch
  // state + chat history.
  useEffect(() => {
    ;(async () => {
      try { await api.joinGame(gameId) } catch { /* already seated or full */ }
      await refreshState()
    })()
    api.getChatHistory(gameId).then(setChat).catch(() => {})
  }, [gameId, refreshState])

  // While in the lobby (waiting for humans), poll so newly-joined seats and the
  // live transition appear without a manual refresh.
  useEffect(() => {
    if (state?.roomPhase !== 'lobby') return
    const t = setInterval(refreshState, 3000)
    return () => clearInterval(t)
  }, [state?.roomPhase, refreshState])

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

  // Live game-state feed — the backend publishes on every change (any human's
  // action, each AI companion turn, the DM setting the scene, the game ending).
  // Every client refetches so all players stay in sync. Without this, a client
  // only learns of changes it caused itself and freezes on a stale turn.
  useEffect(() => {
    let sub
    ;(async () => {
      try {
        const channel = await api.getStateChannel(gameId)
        sub = channel.subscribe(() => { refreshState() })
        await sub.established
      } catch { /* realtime unavailable — fall back to per-action refetch */ }
    })()
    return () => sub?.unsubscribe()
  }, [gameId, refreshState])

  // Live "thinking" feed — stream each acting companion's reasoning tokens.
  useEffect(() => {
    let sub
    ;(async () => {
      try {
        const channel = await api.getThinkingChannel(gameId)
        sub = channel.subscribe((ev) => {
          if (ev.phase === 'start') setThinking({ who: ev.who, color: ev.color, text: '' })
          else if (ev.phase === 'delta') setThinking((t) => t && t.who === ev.who ? { ...t, text: t.text + ev.text } : { who: ev.who, color: ev.color, text: ev.text })
          else if (ev.phase === 'end') setThinking((t) => t && ev.text ? { ...t, text: ev.text } : t)
        })
        await sub.established
      } catch { /* thinking feed unavailable */ }
    })()
    return () => sub?.unsubscribe()
  }, [gameId])

  // Bot-turn stepper: whenever it becomes a bot's turn, resolve exactly one bot
  // turn (with a beat of pacing) so the player visibly sees each companion act
  // and whose turn it is. Re-runs on every state change, walking the whole bot
  // sequence one turn at a time until control returns to a human.
  //
  // Guard is a ref set synchronously in the effect body and cleared in cleanup,
  // so a StrictMode double-mount can't wedge it and runs never overlap. botBusy
  // is separate UI state (drives the "resolving" banner + action lock).
  const inflight = useRef(false)
  useEffect(() => {
    if (!state || inflight.current || acting) return
    if (state.roomPhase !== 'live') return
    // Exactly ONE client drives AI turns, or multiple humans would each fire
    // advanceBotTurn and double-resolve. The host (seat 0 owner) is that driver;
    // everyone else just watches the AI turns arrive via the state channel.
    const myId = state.viewer?.userId ?? character.userId
    const isHost = state.players[0]?.userId === myId
    if (!isHost) return
    const actor = state.players[state.turnIndex]
    // Only auto-resolve AI-companion seats; human seats wait for their player.
    if (state.phase !== 'player' || actor?.seat !== 'ai') return

    inflight.current = true
    let cancelled = false
    setBotBusy(true)
    ;(async () => {
      // brief beat so the "X is taking their turn…" banner is readable
      await new Promise((r) => setTimeout(r, 900))
      if (cancelled) return
      try {
        const res = await api.advanceBotTurn(gameId)
        if (!cancelled && res?.state) setState(res.state)
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Companion turn failed.')
      } finally {
        inflight.current = false
        setBotBusy(false)
        setThinking(null)
      }
    })()
    return () => { cancelled = true; inflight.current = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, gameId, acting])

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

  const startWithAi = useCallback(async () => {
    setError('')
    try {
      await api.startWithAi(gameId)
      await refreshState()
    } catch (e) {
      setError(e?.message || 'Could not start the game.')
    }
  }, [gameId, refreshState])

  // Tick the countdown once a second while a live game has a deadline.
  useEffect(() => {
    if (state?.roomPhase !== 'live' || state?.endsAt == null) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [state?.roomPhase, state?.endsAt])

  // When the clock reaches the server deadline, ask the server once to finalize
  // (it flips the game to 'ended'), so the game-over dialog appears even if the
  // player is idle and never clicks anything.
  const finalized = useRef(false)
  useEffect(() => {
    if (state?.roomPhase !== 'live' || state?.endsAt == null) { finalized.current = false; return }
    if (now >= state.endsAt && !finalized.current) {
      finalized.current = true
      refreshState() // getState finalizes an expired game server-side
    }
  }, [now, state?.roomPhase, state?.endsAt, refreshState])

  const left = (
    <>
      <RailBtn title="Leave Table" onClick={onLeave}>⎋</RailBtn>
    </>
  )
  const right = (
    <>
      <div>
        <RailBtn title={character.name}>
          <Sprite src={character.sprite} alt="you" style={{ height: 30, width: 'auto' }} />
        </RailBtn>
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

  // My seat is whatever the backend says I own — NEVER a fallback to players[0].
  // No seat ⇒ spectator (watch-only). This is what makes "it's my turn" honest.
  const me = state.players.find((p) => p.userId === (state.viewer?.userId ?? character.userId) && p.seat === 'human')
  const spectator = state.viewer?.spectator ?? !me
  const ended = state.roomPhase === 'ended'
  const inLobby = state.roomPhase === 'lobby'
  const isHost = state.players[0]?.userId === (state.viewer?.userId ?? character.userId)
  const current = state.players[state.turnIndex]
  const currentIsMe = !inLobby && !ended && state.phase === 'player' && !!me && current?.id === me.id
  const isMyTurn = currentIsMe && !acting && !botBusy
  const myClass = me ? CLASSES[me.classKey] : null
  const dmActive = state.phase !== 'player'

  // Countdown from the server-authoritative deadline. remainingMs is clamped so
  // it reads 0:00 (not negative) in the moment before the server finalizes.
  const hasTimer = state.roomPhase === 'live' && state.endsAt != null
  const remainingMs = state.endsAt != null ? Math.max(0, state.endsAt - now) : null
  const timerLow = remainingMs != null && remainingMs <= 60_000 // last minute → red
  const fmtClock = (ms) => {
    const s = Math.floor(ms / 1000)
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }

  // A single source of truth for "what's happening right now", surfaced both in a
  // top banner and in the action area so the player always knows the state.
  const status = (() => {
    if (ended) return { text: '⏳ The adventure has ended', tone: 'idle' }
    if (inLobby) return { text: 'Gathering the party — waiting for seats to fill…', tone: 'wait' }
    if (spectator) return { text: `👁 Watching — ${current ? `${current.name}'s turn` : 'in progress'}`, tone: 'idle' }
    if (acting) return { text: 'Resolving your action…', tone: 'busy' }
    if (state.phase === 'dm') return { text: `${state.dmName} is setting the scene…`, tone: 'dm' }
    if (dmActive) return { text: `The Dungeon Master (${state.dmName}) is narrating…`, tone: 'dm' }
    if (currentIsMe) return { text: `Your turn, ${me.name} — choose an action`, tone: 'you' }
    if (current) return { text: `${current.name} the ${CLASSES[current.classKey]?.name ?? ''} is taking their turn…`, tone: 'wait' }
    return { text: '', tone: 'idle' }
  })()
  const statusColor = { you: 'var(--rogue)', wait: 'var(--ranger)', dm: 'var(--dm)', busy: 'var(--gold-bright)', idle: 'var(--text-meta)' }[status.tone]
  const lastRollId = state.log.reduce((last, entry, index) => entry.kind === 'roll' ? index : last, -1)
  let chatRollCount = 0
  const firstHiddenRoll = chat.findIndex((message) => {
    if (message.kind !== 'roll') return false
    chatRollCount += 1
    return chatRollCount > revealedRollCount
  })
  const visibleChat = firstHiddenRoll < 0 ? chat : chat.slice(0, firstHiddenRoll)

  return (
    <Cabinet leftRail={left} rightRail={right}>
      <div className="col game-room" style={{ height: '100%', gap: 8 }}>
        {/* STATUS BANNER — always tells the player whose turn it is / what's happening */}
        <div
          className="row game-status-banner"
          style={{
            flex: '0 0 auto', gap: 10, padding: '7px 14px', borderRadius: 8, alignItems: 'center',
            background: '#0f1120', border: `2px solid ${statusColor}`,
            boxShadow: `0 0 14px ${statusColor}55`,
          }}
        >
          <span style={{
            width: 12, height: 12, borderRadius: '50%', background: statusColor,
            boxShadow: `0 0 8px ${statusColor}`,
            animation: status.tone === 'you' ? 'none' : 'pulseGlow 1.1s ease-in-out infinite', color: statusColor,
          }} />
          <span className="head grow" style={{ fontSize: 12, color: statusColor }}>{status.text}</span>
          {error && <span style={{ color: '#ff6b6b', fontSize: 16 }}>⚠ {error}</span>}
          {/* Session countdown (server-authoritative — survives leaving/returning) */}
          {hasTimer && (
            <span
              className="head"
              title="Time left in this session"
              style={{
                fontSize: 13, padding: '3px 10px', borderRadius: 6,
                color: timerLow ? '#ff6b6b' : 'var(--gold-bright)',
                border: `2px solid ${timerLow ? '#ff6b6b' : 'var(--gold)'}`,
                background: '#00000055',
                animation: timerLow ? 'pulseGlow 1s ease-in-out infinite' : 'none',
              }}
            >
              ⏳ {fmtClock(remainingMs)}
            </span>
          )}
        </div>

        {/* LOBBY BAR — seat status + host controls while gathering the party */}
        {inLobby && (
          <div className="row between lobby-bar" style={{ flex: '0 0 auto', alignItems: 'center', padding: '8px 14px', borderRadius: 8, background: '#12142e', border: '2px solid var(--ranger)' }}>
            <span style={{ fontSize: 19, color: 'var(--text)' }}>
              {state.players.filter((p) => p.seat !== 'open').length}/{state.players.length} seats filled
              {spectator ? ' · you are watching' : isHost ? ' · you are the host' : ' · you are seated'}
            </span>
            {isHost && (
              <button className="btn small" onClick={startWithAi} disabled={acting}>
                ⚔ START NOW (fill with AI)
              </button>
            )}
          </div>
        )}

        {/* LIVE THINKING — streams the acting companion's reasoning as it arrives */}
        {thinking && (
          <div
            className="row gap-sm thinking-banner"
            style={{
              flex: '0 0 auto', alignItems: 'flex-start', padding: '8px 14px', borderRadius: 8,
              background: '#12142e', border: `2px dashed ${thinking.color}`, minHeight: 40,
            }}
          >
            <span style={{ fontSize: 18, animation: 'pulseGlow 1.1s ease-in-out infinite', color: thinking.color }}>🤔</span>
            <span style={{ fontSize: 18, lineHeight: 1.2 }}>
              <span style={{ color: thinking.color }}>{thinking.who} is thinking:</span>{' '}
              <span style={{ color: 'var(--text)' }}>{thinking.text || '…'}</span>
              <span style={{ color: thinking.color }}>▋</span>
            </span>
          </div>
        )}

        <div className="row gap grow game-layout" style={{ alignItems: 'stretch', minHeight: 0 }}>
        {/* TURN ORDER */}
        <div className="panel col turn-order-panel" style={{ flex: '0 0 200px' }}>
          <div className="panel-header">TURN ORDER</div>
          <div className="col grow turn-list" style={{ padding: 10, gap: 10, overflowY: 'auto' }}>
            {state.players.map((p, i) => (
              <TurnChip key={p.id} p={p} n={i + 1} active={!inLobby && state.turnIndex === i && state.phase === 'player'} me={p.id === me?.id} />
            ))}
            <DMTurnChip active={dmActive} />
          </div>
        </div>

        {/* CENTER: board (with AI DM tab + narration overlay) */}
        <div className="col grow board-column" style={{ minWidth: 0 }}>
          <Board
            players={state.players}
            activeIndex={state.phase === 'player' ? state.turnIndex : -1}
            dmName={state.dmName}
            dmActive={dmActive}
            narration={lastDm(state)}
            actions={state.options?.length ? state.options : (myClass?.actions || [])}
            enabled={isMyTurn}
            statusText={status.text}
            statusColor={statusColor}
            onAct={act}
            phase={acting ? 'resolving' : state.phase}
            current={current}
          />
        </div>

        {/* RIGHT: chat + dedicated dice tray */}
        <div className="col gap game-side-panel" style={{ flex: '0 0 260px' }}>
          <div className="grow" style={{ display: 'flex', minHeight: 0 }}>
            <Chat title="CHAT" messages={visibleChat} onSend={sendChat} />
          </div>
          <DiceTray
            roll={state.lastRoll}
            rollId={lastRollId}
            onRollComplete={() => setRevealedRollCount(stateRollCount)}
          />
        </div>
        </div>
      </div>

      {/* GAME-OVER DIALOG — shown when the session's 15 minutes are up. */}
      {ended && <GameOverDialog dmName={state.dmName} onLeave={onLeave} />}
    </Cabinet>
  )
}

// Themed modal shown when the session timer expires.
function GameOverDialog({ dmName, onLeave }) {
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
        <h1 className="head" style={{ fontSize: 22, color: 'var(--gold-bright)' }}>TIME’S UP</h1>
        <p className="meta" style={{ fontSize: 21, lineHeight: 1.3, margin: 0 }}>
          Your 15-minute session has ended. {dmName} closes the tome — this adventure is complete.
        </p>
        <p className="dim" style={{ fontSize: 17, margin: 0 }}>
          The full transcript remains in the chat log.
        </p>
        <button className="btn" onClick={onLeave} style={{ marginTop: 6 }}>
          ⌂ RETURN TO GUILD HALL
        </button>
      </div>
    </div>
  )
}

const lastDm = (state) => [...state.log].reverse().find((l) => l.kind === 'dm')?.text

/* ---------------------------------------------------------------- turn order */
function TurnChip({ p, n, active, me }) {
  return (
    <div className="row gap-sm" style={{ alignItems: 'center', padding: 6, borderRadius: 8, background: active ? '#0f1120' : 'transparent', border: `2px solid ${active ? p.color : 'transparent'}`, boxShadow: active ? `0 0 14px ${p.color}` : 'none' }}>
      <Ring color={p.color} active={active} size={44}>
        <Sprite src={p.sprite} alt={p.name} style={{ height: 34, width: 'auto' }} />
      </Ring>
      {active && <span style={{ position: 'absolute', marginLeft: 150, color: p.color, fontSize: 16 }}>◀</span>}
      <div className="col" style={{ gap: 0 }}>
        <span style={{ fontSize: 18, color: p.color }}>{n}: {p.seat === 'open' ? 'Open Seat' : p.name}</span>
        <span className="dim" style={{ fontSize: 14 }}>
          {CLASSES[p.classKey]?.name}
          {me ? ' (you)' : p.seat === 'ai' ? ' · AI' : p.seat === 'open' ? ' · waiting' : ''}
        </span>
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
function Board({ players, activeIndex, dmName, dmActive, narration, actions, enabled, onAct, phase, current, statusText, statusColor }) {
  // Four token slots in a 2x2 arrangement (percent of board).
  const SLOTS = [
    { left: '27%', top: '32%' },
    { left: '73%', top: '32%' },
    { left: '27%', top: '78%' },
    { left: '73%', top: '78%' },
  ]
  return (
    <div
      className="col board"
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
      <div className="dm-badge-wrap" style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 5 }}>
        <DMBadge name={dmName} active={dmActive} />
      </div>

      {/* character discs — confined to the upper play area so they never collide
          with the narration overlay pinned at the bottom */}
      <div className="token-layer" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: '38%' }}>
        {players.map((p, i) => (
          <Token key={p.id} p={p} pos={SLOTS[p.slot] || SLOTS[i]} active={activeIndex === i} />
        ))}
      </div>

      {/* narration overlay + action menu pinned to the board bottom */}
      <div className="board-overlay" style={{ marginTop: 'auto', position: 'relative', zIndex: 4, padding: 12 }}>
        <div
          className="board-narration"
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
        <ActionMenu actions={actions} enabled={enabled} onAct={onAct} statusText={statusText} statusColor={statusColor} />
      </div>
    </div>
  )
}

function Token({ p, pos, active }) {
  const abilities = CLASSES[p.classKey].abilities || []
  const hpPct = Math.max(0, Math.min(100, (p.hp / 20) * 100))
  return (
    <div className="board-token" style={{ position: 'absolute', left: pos.left, top: pos.top, transform: 'translate(-50%,-50%)', display: 'flex', alignItems: 'center', gap: 6 }}>
      {/* ability icons stacked to the left */}
      <div className="col token-abilities" style={{ gap: 4 }}>
        {abilities.map((a, i) => (
          <div key={i} style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, background: '#0f1120dd', border: `2px solid ${p.color}`, borderRadius: 6, boxShadow: `0 0 6px ${p.color}55` }}>{a}</div>
        ))}
      </div>

      {/* glowing circular disc with the character + nameplate + HP bar */}
      <div className="col center" style={{ position: 'relative' }}>
        <div
          className="token-disc"
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
          <Sprite className="token-sprite" src={p.sprite} alt={p.name} style={{ height: 78, width: 'auto', marginBottom: -4 }} />
        </div>
        {/* nameplate + HP bar overlapping the bottom of the disc */}
        <div className="token-nameplate" style={{ marginTop: -10, minWidth: 88, zIndex: 2 }}>
          <div className="token-name" style={{ fontSize: 16, textAlign: 'center', color: 'var(--text)', background: '#0a0d18', border: `2px solid ${p.color}`, borderRadius: 5, padding: '0 8px' }}>{p.name}</div>
          <div style={{ height: 7, background: '#2a0d10', border: '1px solid #000', borderRadius: 3, marginTop: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${hpPct}%`, background: 'linear-gradient(90deg,#ff3b3b,#c81e1e)' }} />
          </div>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------- actions */
// Always shows a status line so the player knows what's happening. Action buttons
// are truly disabled (not just dimmed) whenever it isn't the player's turn, so a
// stray click can't fire an action out of turn.
function ActionMenu({ actions, enabled, onAct, statusText, statusColor }) {
  return (
    <div className="col center action-menu" style={{ gap: 6, marginTop: 8 }}>
      <div className="head action-status" style={{ fontSize: 11, color: statusColor, textAlign: 'center', marginBottom: 2 }}>
        {enabled ? '▶ YOUR TURN — CHOOSE AN ACTION' : statusText}
      </div>
      {actions.map((a, i) => (
        <button
          key={a}
          className="action-button"
          disabled={!enabled}
          onClick={() => enabled && onAct(a)}
          style={{
            width: 'min(420px, 92%)', textAlign: 'center',
            cursor: enabled ? 'pointer' : 'not-allowed',
            fontFamily: 'var(--font-body)', fontSize: 21,
            color: enabled ? 'var(--text)' : 'var(--text-dim)',
            padding: '8px 12px', borderRadius: 6,
            opacity: enabled ? 1 : 0.45,
            filter: enabled ? 'none' : 'grayscale(0.7)',
            background: !enabled
              ? 'linear-gradient(180deg,#1a1c2e,#141624)'
              : i === 0 ? 'linear-gradient(180deg,#2b2f52,#1b1e36)' : 'linear-gradient(180deg,#232640,#191b30)',
            border: `2px solid ${enabled && i === 0 ? 'var(--gold)' : 'var(--panel-line)'}`,
          }}
          onMouseEnter={(e) => { if (enabled) e.currentTarget.style.borderColor = 'var(--gold)' }}
          onMouseLeave={(e) => { if (enabled) e.currentTarget.style.borderColor = i === 0 ? 'var(--gold)' : 'var(--panel-line)' }}
        >
          {a}
        </button>
      ))}
    </div>
  )
}

/* --------------------------------------------------------------------- dice */
function DiceTray({ roll, rollId, onRollComplete }) {
  const [settledRollId, setSettledRollId] = useState(null)
  const settled = !!roll && settledRollId === rollId

  return (
    <div className="panel dice-tray-panel">
      <div className="panel-header">DICE ROLL</div>
      <div className="row dice-tray-body">
        <DiceCluster
          roll={roll}
          rollId={rollId}
          onRollStart={() => setSettledRollId(null)}
          onRollComplete={() => {
            setSettledRollId(rollId)
            onRollComplete?.()
          }}
        />
        <div className="col roll-summary">
          {roll ? (
            <>
              <span style={{ color: 'var(--text)' }}>{roll.actor}</span>
              <span className="dim">{roll.action}</span>
              <span style={{ color: settled ? (roll.success ? 'var(--rogue)' : '#ff6b6b') : 'var(--gold-bright)' }}>
                {settled ? `${roll.success ? 'SUCCESS' : 'FAIL'} vs DC ${roll.dc}` : 'Rolling...'}
              </span>
            </>
          ) : (
            <span className="dim">Waiting for the first roll</span>
          )}
        </div>
      </div>
    </div>
  )
}

// Cycle through real sprite frames and physically tumble the active die.
function DiceCluster({ roll, rollId, onRollStart, onRollComplete }) {
  const [rolling, setRolling] = useState(false)
  const [shownSprite, setShownSprite] = useState(20)

  useEffect(() => {
    for (const color of ['red', 'blue']) {
      for (const frame of DICE_FRAMES) {
        const image = new Image()
        image.src = diceUrl(color, frame)
      }
    }
  }, [])

  useEffect(() => {
    if (!roll) {
      setRolling(false)
      return
    }

    setRolling(false)
    onRollStart?.()
    const start = requestAnimationFrame(() => setRolling(true))
    const iv = setInterval(() => {
      setShownSprite(DICE_FRAMES[Math.floor(Math.random() * DICE_FRAMES.length)])
    }, 75)
    const done = setTimeout(() => {
      clearInterval(iv)
      setShownSprite(roll.sprite)
      setRolling(false)
      onRollComplete?.()
    }, DICE_ROLL_MS)
    return () => {
      cancelAnimationFrame(start)
      clearInterval(iv)
      clearTimeout(done)
    }
  }, [rollId]) // eslint-disable-line react-hooks/exhaustive-deps

  const redN = roll && roll.color === 'red' ? roll.sprite : 24
  const blueN = roll && roll.color === 'blue' ? roll.sprite : 20
  const animatedRedN = roll?.color === 'red' && rolling ? shownSprite : redN
  const animatedBlueN = roll?.color === 'blue' && rolling ? shownSprite : blueN
  const glow = roll ? (roll.success ? 'var(--rogue)' : 'var(--ranger)') : '#dfa13b88'
  const face = roll ? roll.value : ''
  return (
    <div className={`dice-cluster ${rolling ? 'is-rolling' : ''}`} style={{ position: 'relative', width: 112, height: 82, flex: '0 0 auto' }} title={roll ? `${roll.actor}: ${roll.value} vs DC ${roll.dc}` : 'dice'}>
      <Sprite key={`red-${rollId}`} className={roll?.color === 'red' && rolling ? 'die die-red rolling-primary active-die' : 'die die-red'} src={diceUrl('red', animatedRedN)} alt="red d20" style={{ position: 'absolute', left: 0, top: 0, height: 60, filter: `drop-shadow(0 0 8px ${roll?.color === 'red' ? glow : '#00000088'})` }} />
      <Sprite key={`blue-${rollId}`} className={roll?.color === 'blue' && rolling ? 'die die-blue rolling-primary active-die' : 'die die-blue'} src={diceUrl('blue', animatedBlueN)} alt="blue d20" style={{ position: 'absolute', right: 0, bottom: 0, height: 60, filter: `drop-shadow(0 0 8px ${roll?.color === 'blue' ? glow : '#00000088'})` }} />
      {roll && (
        <span aria-live="polite" className={rolling ? 'dice-result rolling' : 'dice-result'} style={{ position: 'absolute', top: -6, right: -4, fontFamily: 'var(--font-head)', fontSize: 11, color: rolling ? 'var(--gold-bright)' : glow, textShadow: '0 1px 2px #000' }}>{rolling ? 'ROLLING' : face}</span>
      )}
    </div>
  )
}

function DMBadge({ name, active }) {
  return (
    <div className="row gap-sm dm-badge" style={{ alignItems: 'center', padding: '5px 14px', borderRadius: 20, background: '#0f1120ee', border: '2px solid var(--dm)', boxShadow: active ? '0 0 18px var(--dm)' : '0 2px 6px #000a', color: 'var(--dm)' }}>
      <span style={{ fontSize: 18, filter: 'drop-shadow(0 0 6px var(--dm-flame))' }}>💀</span>
      <span className="head" style={{ fontSize: 11 }}>AI DM: {name}</span>
    </div>
  )
}
