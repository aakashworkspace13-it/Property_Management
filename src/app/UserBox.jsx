import { useAuth } from '../features/auth/auth-context.js'

// Signed-in person, role and sign-out button.
export default function UserBox() {
  const { user, member, signOut } = useAuth()
  return (
    <div className="user-box">
      <div>
        <strong>{member?.name ?? user?.email}</strong>
        <div className="muted small">{member?.role === 'admin' ? 'Admin' : 'Family member'}</div>
      </div>
      <button type="button" className="button small-button" onClick={signOut}>
        Sign out
      </button>
    </div>
  )
}
