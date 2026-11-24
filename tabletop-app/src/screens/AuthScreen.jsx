import { useState } from 'react'
import Frame from '../components/Frame.jsx'
import Sprite from '../components/Sprite.jsx'
import { signIn, signUp, confirmSignUp } from '../api.js'

// Themed username/password gate. Wraps the Blocks Auth state machine
// (signIn/signUp/confirmSignUp) in the guild-hall visual style. Sign-up asks for
// an email address and then the code emailed to it. On success, onAuthed(user)
// fires and App advances to character select.
export default function AuthScreen({ onAuthed }) {
  const [mode, setMode] = useState('signIn') // 'signIn' | 'signUp' | 'confirm'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e?.preventDefault()
    setError('')
    if (mode === 'confirm') {
      if (!/^\d{6}$/.test(code.trim())) return setError('Enter the 6-digit code from your email.')
    } else {
      if (username.trim().length < 3) return setError('Name must be at least 3 characters.')
      if (password.length < 8) return setError('Password must be at least 8 characters.')
      if (mode === 'signUp' && !email.includes('@')) return setError('Enter a valid email address.')
    }
    setBusy(true)
    try {
      let state
      if (mode === 'confirm') state = await confirmSignUp(username.trim(), code.trim())
      else if (mode === 'signUp') state = await signUp(username.trim(), password, email.trim())
      else state = await signIn(username.trim(), password)
      if (state.user) onAuthed(state.user)
      else if (mode === 'signUp' && !state.errorName && state.state === 'confirmingSignUp') setMode('confirm')
      else setError(state.error || state.errorName || 'Could not sign in. Check your credentials.')
    } catch (err) {
      setError(err?.message || 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="col center auth-screen" style={{ height: '100vh', padding: 24, gap: 18 }}>
      <Sprite src="/ui/crest.png" alt="crest" style={{ height: 90, width: 'auto', filter: 'drop-shadow(0 0 12px #00ffff55)' }} />
      <h1 style={{ fontSize: 24, textAlign: 'center' }}>ADVENTURER'S GUILD HALL</h1>
      <p className="meta" style={{ fontSize: 22, marginTop: -8 }}>
        {mode === 'confirm' ? 'Check your email for a code'
          : mode === 'signUp' ? 'Register a new adventurer' : 'Welcome back, adventurer'}
      </p>

      <Frame style={{ width: 'min(420px, 94vw)' }} innerStyle={{ padding: 22 }}>
        <form className="col" onSubmit={submit}>
          {mode === 'confirm' ? (
            <div className="field">
              <label>Verification Code</label>
              <input type="text" inputMode="numeric" value={code} maxLength={6} autoFocus
                placeholder="6 digits" onChange={(e) => setCode(e.target.value)} />
            </div>
          ) : (
            <>
              <div className="field">
                <label>Adventurer Name</label>
                <input type="text" value={username} maxLength={20} autoFocus
                  placeholder="e.g. aldric" onChange={(e) => setUsername(e.target.value)} />
              </div>
              {mode === 'signUp' && (
                <div className="field">
                  <label>Email</label>
                  <input type="email" value={email}
                    placeholder="for your confirmation code" onChange={(e) => setEmail(e.target.value)} />
                </div>
              )}
              <div className="field">
                <label>Password</label>
                <input type="password" value={password} minLength={8}
                  placeholder="at least 8 characters" onChange={(e) => setPassword(e.target.value)} />
              </div>
            </>
          )}

          {error && (
            <div style={{ color: '#ff6b6b', fontSize: 18, marginBottom: 10 }}>⚠ {error}</div>
          )}

          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'confirm' ? 'CONFIRM & ENTER' : mode === 'signUp' ? 'REGISTER' : 'SIGN IN'}
          </button>
        </form>

        <div className="center" style={{ display: 'flex', marginTop: 14 }}>
          <button className="btn-ghost" style={{ background: 'none', border: 'none', color: 'var(--text-meta)', fontFamily: 'var(--font-body)', fontSize: 19, cursor: 'pointer' }}
            onClick={() => { setMode(mode === 'signIn' ? 'signUp' : 'signIn'); setError(''); setCode('') }}>
            {mode === 'signIn' ? 'New here? Create an account' : 'Already have an account? Sign in'}
          </button>
        </div>
      </Frame>
    </div>
  )
}
