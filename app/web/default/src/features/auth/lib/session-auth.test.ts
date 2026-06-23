import { describe, expect, test } from 'bun:test'
import type { AuthUser } from '../../../stores/auth-store'
import { verifyWebSession } from './session-auth'

function createAuthStore() {
  return {
    user: null as AuthUser | null,
    resetCalled: false,
    setUser(user: AuthUser | null) {
      this.user = user
    },
    reset() {
      this.resetCalled = true
      this.user = null
    },
  }
}

describe('verifyWebSession', () => {
  test('uses /api/user/self success as the authenticated source of truth', async () => {
    const auth = createAuthStore()
    const user = {
      id: 2,
      username: 'tester',
      role: 1,
    } as AuthUser

    const authenticated = await verifyWebSession(
      async () => ({ success: true, data: user }),
      auth
    )

    expect(authenticated).toBe(true)
    expect(auth.user).toEqual(user)
    expect(auth.resetCalled).toBe(false)
  })

  test('resets cached user state when /api/user/self fails', async () => {
    const auth = createAuthStore()
    auth.user = {
      id: 2,
      username: 'stale',
      role: 1,
    } as AuthUser

    const authenticated = await verifyWebSession(
      async () => ({ success: false, data: null }),
      auth
    )

    expect(authenticated).toBe(false)
    expect(auth.user).toBeNull()
    expect(auth.resetCalled).toBe(true)
  })
})
