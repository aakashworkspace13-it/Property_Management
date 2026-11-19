import { createContext, useContext } from 'react'

export const AuthContext = createContext(null)

/**
 * Current sign-in state.
 * status: 'loading' | 'configError' | 'signedOut' | 'needsSetup' | 'notAuthorised' | 'ready'
 */
export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>.')
  return value
}
