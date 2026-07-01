import { useState } from 'react'
import Login from './screens/Login.jsx'
import GuildHall from './screens/GuildHall.jsx'
import GameRoom from './screens/GameRoom.jsx'

// Top-level view state machine: login → guild hall → game room.
export default function App() {
  const [view, setView] = useState('login') // 'login' | 'hall' | 'game'
  const [player, setPlayer] = useState(null)
  const [gameConfig, setGameConfig] = useState(null)

  const startGame = ({ scenario, dm }) => {
    setGameConfig({
      human: player,
      scenario: scenario || 'Cave Crypt',
      dmName: dm || 'Grimjaw',
      // Deterministic-ish seed from name + scenario so sessions vary.
      seed: hashSeed(`${player.name}:${scenario}:${dm}`),
    })
    setView('game')
  }

  if (view === 'login') {
    return <Login onEnter={(p) => { setPlayer(p); setView('hall') }} />
  }
  if (view === 'hall') {
    return (
      <GuildHall
        player={player}
        onLaunch={startGame}
        onJoin={(g) => startGame({ scenario: g.theme, dm: g.dm })}
      />
    )
  }
  return <GameRoom config={gameConfig} onLeave={() => setView('hall')} />
}

function hashSeed(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
