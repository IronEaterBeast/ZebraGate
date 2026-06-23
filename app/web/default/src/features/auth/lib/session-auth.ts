import type { AuthUser } from '../../../stores/auth-store'

type AuthSessionStore = {
  setUser: (user: AuthUser | null) => void
  reset: () => void
}

type SelfResponse = {
  success?: boolean
  data?: AuthUser | null
}

export async function verifyWebSession(
  getCurrentUser: () => Promise<SelfResponse | null>,
  auth: AuthSessionStore
): Promise<boolean> {
  const res = await getCurrentUser().catch(() => null)
  if (res?.success && res.data) {
    auth.setUser(res.data)
    return true
  }

  auth.reset()
  return false
}
