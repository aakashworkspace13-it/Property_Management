import { useState } from 'react'
import { claimOwnership } from '../../services/members.js'
import { usingEmulators } from '../../services/firebase.js'
import { useAuth } from './auth-context.js'

function Screen({ title, children }) {
  return (
    <div className="auth-screen">
      <div className="card auth-card">
        <div className="brand">
          <img src="/favicon.svg" alt="" width="36" height="36" />
          <span>Family Property</span>
        </div>
        <h1>{title}</h1>
        {children}
        {usingEmulators && <p className="hint">Development mode: using the local Firebase emulators.</p>}
      </div>
    </div>
  )
}

export function LoadingScreen() {
  return (
    <Screen title="Loading…">
      <p className="muted">Checking your sign-in.</p>
    </Screen>
  )
}

export function ConfigErrorScreen() {
  const { error } = useAuth()
  return (
    <Screen title="Setup needed">
      <p className="error">{error}</p>
    </Screen>
  )
}

export function SignInScreen() {
  const { signIn, error } = useAuth()
  const [busy, setBusy] = useState(false)
  async function handleClick() {
    setBusy(true)
    await signIn()
    setBusy(false)
  }
  return (
    <Screen title="Sign in">
      <p className="muted">Only family members added by an admin can use this app.</p>
      <button type="button" className="button primary wide" onClick={handleClick} disabled={busy}>
        {busy ? 'Opening Google…' : 'Sign in with Google'}
      </button>
      {error && <p className="error">{error}</p>}
    </Screen>
  )
}

export function OwnerSetupScreen() {
  const { user, signOut } = useAuth()
  const [name, setName] = useState(user?.displayName ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(event) {
    event.preventDefault()
    if (!name.trim()) return setError('Enter your name.')
    setBusy(true)
    setError(null)
    try {
      await claimOwnership(user, name)
    } catch (e) {
      setError(e.code === 'permission-denied' ? 'Someone else has already set up this app.' : e.message)
      setBusy(false)
    }
  }

  return (
    <Screen title="Set up the app">
      <p>
        Nobody has set up this app yet. You can become its <strong>owner</strong> (first admin) as{' '}
        <strong>{user?.email}</strong>.
      </p>
      <p className="muted">This can only happen once. After that, admins add family members in Settings.</p>
      <form onSubmit={handleSubmit} className="form">
        <label>
          Your name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="name" />
        </label>
        <button type="submit" className="button primary wide" disabled={busy}>
          {busy ? 'Setting up…' : 'Become the owner'}
        </button>
        <button type="button" className="button wide" onClick={signOut} disabled={busy}>
          Sign out
        </button>
        {error && <p className="error">{error}</p>}
      </form>
    </Screen>
  )
}

export function NotAuthorisedScreen() {
  const { user, member, signOut, error } = useAuth()
  return (
    <Screen title={member && !member.active ? 'Access turned off' : 'Not on the family list'}>
      <p>
        You are signed in as <strong>{user?.email}</strong>.
      </p>
      <p className="muted">
        {member && !member.active
          ? 'An admin has turned off access for this account. Ask an admin if this is a mistake.'
          : 'Ask a family admin to add this email in Settings → Family members, then sign in again.'}
      </p>
      <button type="button" className="button wide" onClick={signOut}>
        Sign out / use another account
      </button>
      {error && <p className="error small">{error}</p>}
    </Screen>
  )
}
