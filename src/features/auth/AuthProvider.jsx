import { useEffect, useMemo, useState } from 'react'
import { getRedirectResult, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut } from 'firebase/auth'
import { auth, configError, googleProvider } from '../../services/firebase.js'
import { memberId, watchMember, watchSetup } from '../../services/members.js'
import { AuthContext } from './auth-context.js'

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined) // undefined = still checking
  // Snapshots are stored with the email they belong to, so a stale snapshot from a previous
  // account is never mistaken for the current one.
  const [memberSnap, setMemberSnap] = useState(null)
  const [setupSnap, setSetupSnap] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (configError) return undefined
    // Completes a redirect sign-in (used when the browser blocks the Google popup).
    getRedirectResult(auth).catch((e) => setError(e.message))
    return onAuthStateChanged(auth, (u) => setUser(u ?? null))
  }, [])

  useEffect(() => {
    if (!user) return undefined
    const email = memberId(user.email)
    const onError = (e) => setError(e.message)
    const stopMember = watchMember(email, (data) => setMemberSnap({ email, data }), onError)
    const stopSetup = watchSetup((exists) => setSetupSnap({ email, exists }), onError)
    return () => {
      stopMember()
      stopSetup()
    }
  }, [user])

  const value = useMemo(() => {
    const email = user ? memberId(user.email) : null
    const member = memberSnap?.email === email ? memberSnap.data : undefined
    const setupExists = setupSnap?.email === email ? setupSnap.exists : undefined

    let status
    if (configError) status = 'configError'
    else if (user === undefined) status = 'loading'
    else if (user === null) status = 'signedOut'
    else if (member === undefined || setupExists === undefined) status = error ? 'notAuthorised' : 'loading'
    else if (member?.active) status = 'ready'
    else if (!setupExists) status = 'needsSetup'
    else status = 'notAuthorised'

    return {
      status,
      user: user ?? null,
      member: member ?? null,
      isAdmin: status === 'ready' && member?.role === 'admin',
      error: configError ?? error,
      async signIn() {
        setError(null)
        try {
          await signInWithPopup(auth, googleProvider)
        } catch (e) {
          if (e.code === 'auth/popup-blocked') await signInWithRedirect(auth, googleProvider)
          else if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') setError(e.message)
        }
      },
      async signOut() {
        setError(null)
        await signOut(auth)
      },
    }
  }, [user, memberSnap, setupSnap, error])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
