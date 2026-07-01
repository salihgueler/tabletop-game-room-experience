import { useEffect, useState } from 'react'
import AuthScreen from './screens/AuthScreen.jsx'
import Login from './screens/Login.jsx'
import GuildHall from './screens/GuildHall.jsx'
import GameRoom from './screens/GameRoom.jsx'
import { api, authApi } from './api.js'
import { onAuthChange } from '@aws-blocks/blocks/ui'

// Top-level flow: auth → character select → guild hall → game room.
// Auth + character live in the backend; this only tracks which view to show.
export default function App() {
  const [ready, setReady] = useState(false)
  const [user, setUser] = useState(null)
  const [character, setCharacter] = useState(null)
  const [view, setView] = useState('hall') // 'hall' | 'game'
  const [gameId, setGameId] = useState(null)

  // Subscribe to auth changes and restore any existing character on sign-in.
  useEffect(() => {
    const unsub = onAuthChange(authApi, async (u) => {
      setUser(u)
      if (u) {
        try {
          const existing = await api.getCharacter()
          setCharacter(existing)
        } catch {
          setCharacter(null)
        }
      } else {
        setCharacter(null)
      }
      setReady(true)
    })
    return () => unsub?.()
  }, [])

  if (!ready) {
    return <div className="col center" style={{ height: '100vh', color: 'var(--text-meta)', fontSize: 24 }}>Loading the guild hall…</div>
  }

  // Not signed in → auth gate.
  if (!user) return <AuthScreen onAuthed={setUser} />

  // Signed in but no character chosen → character select.
  if (!character) return <Login user={user} onEnter={setCharacter} />

  // In a game.
  if (view === 'game' && gameId) {
    return <GameRoom gameId={gameId} character={character} onLeave={() => { setView('hall'); setGameId(null) }} />
  }

  // Guild hall lobby.
  return (
    <GuildHall
      character={character}
      onOpenGame={(id) => { setGameId(id); setView('game') }}
    />
  )
}
