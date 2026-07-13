import { useCallback, useEffect, useRef, useState } from 'react'
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

  const sessionRequest = useRef(0)

  const restoreSession = useCallback(async (u) => {
    const request = ++sessionRequest.current
    setReady(false)
    setUser(u ?? null)

    if (!u) {
      setCharacter(null)
      setView('hall')
      setGameId(null)
      if (request === sessionRequest.current) setReady(true)
      return
    }

    let existing = null
    try {
      existing = await api.getCharacter()
    } catch {
      existing = null
    }

    if (request !== sessionRequest.current) return
    setUser(u)
    setCharacter(existing)
    setView('hall')
    setGameId(null)
    setReady(true)
  }, [])

  // Hydrate the real auth state before the first interactive screen appears,
  // then subscribe to later sign-in/sign-out broadcasts.
  useEffect(() => {
    let cancelled = false
    let unsub

    ;(async () => {
      try {
        const state = await authApi.getAuthState()
        if (!cancelled) await restoreSession(state.user ?? null)
      } catch {
        if (!cancelled) await restoreSession(null)
      }

      if (cancelled) return
      let skipInitialEmit = true
      unsub = onAuthChange(authApi, (u) => {
        if (skipInitialEmit) {
          skipInitialEmit = false
          return
        }
        restoreSession(u)
      })
    })()

    return () => {
      cancelled = true
      unsub?.()
    }
  }, [restoreSession])

  if (!ready) {
    return <div className="col center" style={{ height: '100vh', color: 'var(--text-meta)', fontSize: 24 }}>Loading the guild hall…</div>
  }

  // Not signed in → auth gate.
  if (!user) return <AuthScreen onAuthed={restoreSession} />

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
