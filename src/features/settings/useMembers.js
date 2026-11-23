import { useEffect, useState } from 'react'
import { watchMembers } from '../../services/members.js'

/** Live list of family members (null until loaded). Used for sharing Drive files. */
export function useMembers() {
  const [members, setMembers] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => watchMembers(setMembers, (e) => setError(e.message)), [])
  return { members, error }
}
