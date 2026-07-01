import { useState } from 'react'
import Cabinet, { RailBtn } from '../components/Cabinet.jsx'
import Chat from '../components/Chat.jsx'
import Sprite from '../components/Sprite.jsx'
import { CLASSES } from '../data/classes.js'
import { MOCK_GAMES, SEED_CHAT, SCENARIOS, DM_TYPES } from '../data/mockGames.js'
import { COLLECTION, diceUrl } from '../data/dice.js'

// The Adventurer's Guild Hall (home) — laid out inside the full-screen wooden
// cabinet to mirror homepage.png.
export default function GuildHall({ player, onLaunch, onJoin }) {
  const [chat, setChat] = useState(SEED_CHAT)
  const [scenario, setScenario] = useState(SCENARIOS[0])
  const [dm, setDm] = useState(DM_TYPES[0])
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')

  const sendChat = (text) => {
    if (!text.trim()) return
    setChat((c) => [...c, { who: player.name, color: CLASSES[player.classKey].color, text }])
  }

  const left = (<><RailBtn title="Settings">⚙</RailBtn><RailBtn title="Help">?</RailBtn></>)
  const right = (
    <>
      <div>
        <RailBtn title="Profile">
          <Sprite src={player.sprite} alt="you" style={{ height: 30, width: 'auto' }} />
        </RailBtn>
        <RailBtn title="Guild">⌂</RailBtn>
        <RailBtn title="Party">☰</RailBtn>
        <RailBtn title="Link">⚭</RailBtn>
      </div>
      <span />
    </>
  )

  return (
    <Cabinet leftRail={left} rightRail={right}>
      <div className="col" style={{ height: '100%', gap: 10 }}>
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
            AI DM: {dm}
          </div>
        </div>

        {/* Three columns */}
        <div className="row gap grow" style={{ alignItems: 'stretch', minHeight: 0 }}>
          {/* PUBLIC GAME LIST */}
          <div className="panel col" style={{ flex: '1.35' }}>
            <div className="panel-header">PUBLIC GAME LIST</div>
            <div className="grow" style={{ overflowY: 'auto', padding: 10 }}>
              {MOCK_GAMES.map((g) => (
                <GameCard key={g.id} game={g} onJoin={() => onJoin(g)} />
              ))}
            </div>
          </div>

          {/* CREATE A NEW GAME */}
          <div className="panel col" style={{ flex: '1' }}>
            <div className="panel-header">CREATE A NEW GAME</div>
            <div className="col grow" style={{ padding: 14, overflowY: 'auto' }}>
              <div className="field">
                <label>Scenario Theme</label>
                <select value={scenario} onChange={(e) => setScenario(e.target.value)}>
                  {SCENARIOS.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="field">
                <label>AI DM Type</label>
                <select value={dm} onChange={(e) => setDm(e.target.value)}>
                  {DM_TYPES.map((d) => <option key={d}>{d}</option>)}
                </select>
              </div>
              <label className="row gap-sm" style={{ alignItems: 'center', margin: '2px 0 14px', fontSize: 20, cursor: 'pointer' }}>
                <input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} style={{ width: 18, height: 18 }} />
                <span className="meta">Open to Public?</span>
              </label>
              <button className="btn" onClick={() => onLaunch({ scenario, dm, open })} style={{ fontSize: 13 }}>
                🔥 LAUNCH NEW ADVENTURE
              </button>

              <div className="panel" style={{ marginTop: 16 }}>
                <div className="panel-header">JOIN PRIVATE GAME</div>
                <div className="row gap-sm" style={{ padding: 12 }}>
                  <input type="text" className="grow" placeholder="Access Code" value={code} onChange={(e) => setCode(e.target.value)} />
                  <button className="btn small btn-ghost" onClick={() => code.trim() && onLaunch({ scenario, dm, open: false, code })}>→</button>
                </div>
              </div>
            </div>
          </div>

          {/* CHAT */}
          <div style={{ flex: '0.85', display: 'flex' }}>
            <Chat title="CHAT" messages={chat} onSend={sendChat} />
          </div>
        </div>

        {/* Footer nav + dice collection */}
        <div className="row between" style={{ alignItems: 'flex-end', flex: '0 0 auto' }}>
          <div className="row gap-sm wrap">
            {['Guild Directory', 'Profile Settings', 'Help & Lore', 'Community'].map((t) => (
              <button key={t} className="btn small btn-ghost">{t}</button>
            ))}
          </div>
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
    </Cabinet>
  )
}

function GameCard({ game, onJoin }) {
  const full = game.party >= game.maxParty
  return (
    <div className="panel" style={{ padding: 12, marginBottom: 10, borderColor: 'var(--wood)' }}>
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div className="grow">
          <div className="head" style={{ fontSize: 12, color: 'var(--gold-bright)', marginBottom: 6 }}>{game.name}</div>
          <div className="dim" style={{ fontSize: 16 }}>{game.note}</div>
          <div className="meta" style={{ fontSize: 18, marginTop: 4 }}>Current Party Size: {game.party}/{game.maxParty} Players</div>
          <div className="meta" style={{ fontSize: 18 }}>AI DM Level: {game.dmLevel}</div>
          <div style={{ fontSize: 18, marginTop: 2 }}>
            Status: <span style={{ color: game.status === 'In Session' ? 'var(--rogue)' : 'var(--ranger)' }}>{game.status}</span>
          </div>
        </div>
        <div className="col gap-sm" style={{ alignItems: 'flex-end' }}>
          <div className="row" style={{ gap: 2 }}>
            {game.partyClasses.map((c, i) => (
              <Sprite key={i} src={`/sprites/characters/${CLASSES[c].variants[0]}.png`} alt={c} style={{ height: 30, width: 'auto' }} />
            ))}
          </div>
          <div className="row gap-sm">
            <button className="btn small btn-ghost">View Party</button>
            <button className="btn small" disabled={full} onClick={onJoin}>{full ? 'Full' : 'Join Game'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
