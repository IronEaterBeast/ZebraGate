/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useState } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import { api } from '@/lib/api'

const routeApi = getRouteApi('/desktop-login')

type Status = 'form' | 'submitting' | 'linking' | 'linked' | 'error'

// 桌面客户端会以系统浏览器打开本页面，并通过 ?callback= 传入本地代理的回调地址。
// 用户用 ZebraGate 账号登录后，本页获取该用户的 access token，再 POST 给本地回调，
// 让桌面客户端建立登录态。本页面有意不写入 Web 自身的登录 store / localStorage，
// 以保持桌面与 Web 会话相互独立。
//
// 说明：access token 通过 /api/user/self/token 获取，该接口每次调用都会为用户
// 重新生成 access token（覆盖旧值）。对桌面场景而言可接受——桌面会保存最新 token。
export function DesktopLogin() {
  const { callback: callbackUrl } = routeApi.useSearch()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<Status>('form')
  const [submitError, setSubmitError] = useState<string | null>(null)

  // 缺少回调地址是由 URL 直接派生的错误，渲染期即可确定，无需放入 effect。
  const missingCallback = !callbackUrl
  const error = missingCallback
    ? '缺少回调地址，请从 ZebraGate 桌面客户端重新打开此页面。'
    : submitError

  async function sendSessionToDesktop(payload: {
    accessToken: string
    refreshToken: string
    email: string | null
    userId: string
    expiresAt: number | null
  }): Promise<void> {
    if (!callbackUrl) {
      return
    }

    setStatus('linking')
    const response = await fetch(callbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      throw new Error('ZebraGate 桌面客户端未接受此次登录。')
    }
    setStatus('linked')
  }

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault()
    if (!callbackUrl) {
      return
    }

    setStatus('submitting')
    setSubmitError(null)

    try {
      // 1. 登录建立会话，拿到用户 id。
      const loginRes = await api.post(
        '/api/user/login?turnstile=',
        { username, password },
        { skipBusinessError: true }
      )
      if (!loginRes.data?.success || !loginRes.data?.data?.id) {
        throw new Error(loginRes.data?.message || '登录失败，请检查账号或密码。')
      }
      const userId: number = loginRes.data.data.id
      // 登录后续接口需要 New-Api-User 头标识当前用户。
      const userHeaders = { 'New-Api-User': String(userId) }

      // 2. 获取该用户的 access token。
      const tokenRes = await api.get('/api/user/self/token', {
        headers: userHeaders,
        skipBusinessError: true,
      })
      const accessToken: string | undefined = tokenRes.data?.data
      if (!tokenRes.data?.success || !accessToken) {
        throw new Error(tokenRes.data?.message || '获取访问令牌失败。')
      }

      // 3. 获取邮箱用于桌面端展示（失败不阻断登录链路）。
      let email: string | null = null
      try {
        const selfRes = await api.get('/api/user/self', {
          headers: userHeaders,
          skipBusinessError: true,
        })
        if (selfRes.data?.success && selfRes.data?.data?.email) {
          email = selfRes.data.data.email
        }
      } catch {
        /* email 获取失败不影响登录 */
      }

      // 4. access token 无独立刷新令牌，这里复用同一 token 作为 refreshToken；
      //    expiresAt 交由后端 /v1/auth/refresh 决定，前端传 null。
      await sendSessionToDesktop({
        accessToken,
        refreshToken: accessToken,
        email,
        userId: String(userId),
        expiresAt: null,
      })
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '登录失败。')
      setStatus('error')
    }
  }

  if (status === 'linked') {
    return (
      <main className="mx-auto mt-16 max-w-md px-4">
        <div className="rounded-2xl border border-border bg-card p-6 text-center">
          <h1 className="text-xl font-semibold">登录成功</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            ZebraGate 桌面客户端已完成登录，您可以关闭此窗口。
          </p>
        </div>
      </main>
    )
  }

  const disabled =
    status === 'submitting' || status === 'linking' || !callbackUrl

  return (
    <main className="mx-auto mt-16 max-w-md px-4">
      <div className="rounded-2xl border border-border bg-card p-6">
        <h1 className="text-xl font-semibold">登录 ZebraGate 桌面客户端</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          使用您的 ZebraGate 账号登录，以将桌面客户端与您的账号关联。
        </p>
        <form
          className="mt-4 grid gap-4"
          onSubmit={(event) => void handleSubmit(event)}
        >
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">用户名</span>
            <input
              className="rounded-xl border border-border bg-background px-3 py-2"
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">密码</span>
            <input
              className="rounded-xl border border-border bg-background px-3 py-2"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {status === 'linking' ? (
            <p className="text-sm text-muted-foreground">
              正在关联 ZebraGate 桌面客户端...
            </p>
          ) : null}
          <button
            className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            type="submit"
            disabled={disabled}
          >
            登录
          </button>
        </form>
      </div>
    </main>
  )
}
