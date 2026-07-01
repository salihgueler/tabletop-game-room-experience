import { useState } from 'react'
import Frame from '../components/Frame.jsx'
import Sprite from '../components/Sprite.jsx'
import { signIn, signUp } from '../api.js'

// Themed username/password gate. Wraps the Blocks AuthBasic state machine
// (signIn/signUp) in the guild-hall visual style. On success, onAuthed(user)
// fires and App advances to character select.
export default function AuthScreen({ onAuthed }) {
  const [mode, setMode] = useState('signIn') // 'signIn' | 'signUp'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e?.preventDefault()
    setError('')
    if (username.trim().length < 3) return setError('Name must be at least 3 characters.')
    if (password.length < 8) return setError('Password must be at least 8 characters.')
    setBusy(true)
    try {
      const fn = mode === 'signUp' ? signUp : signIn
      const state = await fn(username.trim(), password)
      if (state.user) onAuthed(state.user)
      else setError(state.errorName || 'Could not sign in. Check your credentials.')
    } catch (err) {
      setError(err?.message || 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="col center" style={{ height: '100vh', padding: 24, gap: 18 }}>
      <Sprite src="/ui/crest.png" alt="crest" style={{ height: 90, width: 'auto', filter: 'drop-shadow(0 0 12px #00ffff55)' }} />
      <h1 style={{ fontSize: 24, textAlign: 'center' }}>ADVENTURER'S GUILD HALL</h1>
      <p className="meta" style={{ fontSize: 22, marginTop: -8 }}>
        {mode === 'signUp' ? 'Register a new adventurer' : 'Welcome back, adventurer'}
      </p>

      <Frame style={{ width: 'min(420px, 94vw)' }} innerStyle={{ padding: 22 }}>
        <form className="col" onSubmit={submit}>
          <div className="field">
            <label>Adventurer Name</label>
            <input type="text" value={username} maxLength={20} autoFocus
              placeholder="e.g. aldric" onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" value={password} minLength={8}
              placeholder="at least 8 characters" onChange={(e) => setPassword(e.target.value)} />
          </div>

          {error && (
            <div style={{ color: '#ff6b6b', fontSize: 18, marginBottom: 10 }}>⚠ {error}</div>
          )}

          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'signUp' ? 'REGISTER & ENTER' : 'SIGN IN'}
          </button>
        </form>

        <div className="center" style={{ display: 'flex', marginTop: 14 }}>
          <button className="btn-ghost" style={{ background: 'none', border: 'none', color: 'var(--text-meta)', fontFamily: 'var(--font-body)', fontSize: 19, cursor: 'pointer' }}
            onClick={() => { setMode(mode === 'signUp' ? 'signIn' : 'signUp'); setError('') }}>
            {mode === 'signUp' ? 'Already have an account? Sign in' : 'New here? Create an account'}
          </button>
        </div>
      </Frame>
    </div>
  )
}
