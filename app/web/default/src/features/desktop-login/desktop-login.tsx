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
import { useEffect, useState } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import { api, getSelf } from '@/lib/api'

const routeApi = getRouteApi('/desktop-login')

// 桌面客户端会以系统浏览器打开本页面，并通过 ?callback= 传入本地代理的回调地址。
// 本页将浏览器中「已建立的 ZebraGate 登录态」作为上游凭证源，派生出该用户的
// access token，再 POST 给本地回调，让桌面客户端建立自己的登录态。
//
// 设计纪律（参考 GitHub CLI 等原生应用授权流程）：
//   - 浏览器已登录 => 本页是「授权确认页」，展示当前用户并提供一个授权按钮，
//     不再要求重新输入账号密码，也不反向修改浏览器自身的登录态。
//   - 浏览器未登录 => 本页不内联登录，而是引导用户去标准登录页完成登录，
//     登录是用户在浏览器中主动且标准地完成的，桌面流程不直接操作 Web 会话。
//   - 单向：桌面（下游）只读取并派生令牌，绝不回写浏览器（上游）的会话。
//
// 因此本页所有后端请求都复用全局 api 实例，由其拦截器自动附带与当前会话一致的
// 用户标识，不再手动传任何用户 id 头——这从根上避免了「会话用户与所传 id 不一致」
// 导致的 401。
//
// 说明：access token 通过 /api/user/token 获取，该接口每次调用都会为用户
// 重新生成 access token（覆盖旧值）。对桌面场景而言可接受——桌面会保存最新 token。

type Status =
  | 'checking' // 正在探测浏览器登录态
  | 'authorize' // 已登录，等待用户点击授权
  | 'need-web-login' // 未登录，引导去标准登录页
  | 'authorizing' // 正在获取 token 并回传桌面
  | 'linked' // 已成功回传桌面
  | 'error'

interface SessionUser {
  id: number
  username: string
  displayName: string | null
  email: string | null
}

export function DesktopLogin() {
  const { callback: callbackUrl } = routeApi.useSearch()

  const [status, setStatus] = useState<Status>('checking')
  const [user, setUser] = useState<SessionUser | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // 缺少回调地址是由 URL 直接派生的错误，渲染期即可确定，无需放入 effect。
  const missingCallback = !callbackUrl

  // 探测浏览器当前的登录态：直接以 session 调 /api/user/self，
  // 它反映后端真实登录用户，避免使用本地缓存可能与会话不一致。
  useEffect(() => {
    if (missingCallback) {
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const self = await getSelf()
        if (cancelled) {
          return
        }
        if (self?.success && self.data?.id) {
          setUser({
            id: self.data.id,
            username: self.data.username,
            displayName: self.data.display_name || null,
            email: self.data.email || null,
          })
          setStatus('authorize')
        } else {
          setStatus('need-web-login')
        }
      } catch {
        if (!cancelled) {
          setStatus('need-web-login')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [missingCallback])

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
    const response = await fetch(callbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      throw new Error('ZebraGate 桌面客户端未接受此次登录。')
    }
  }

  async function handleAuthorize(): Promise<void> {
    if (!callbackUrl || !user) {
      return
    }

    setStatus('authorizing')
    setSubmitError(null)

    try {
      // 以当前浏览器会话派生该用户的 access token。
      // 不传任何用户 id 头：全局 api 拦截器会附带与会话一致的标识。
      const tokenRes = await api.get('/api/user/token', {
        skipBusinessError: true,
      })
      const accessToken: string | undefined = tokenRes.data?.data
      if (!tokenRes.data?.success || !accessToken) {
        throw new Error(tokenRes.data?.message || '获取访问令牌失败。')
      }

      // access token 无独立刷新令牌，这里复用同一 token 作为 refreshToken；
      // expiresAt 交由后端 /v1/auth/refresh 决定，前端传 null。
      await sendSessionToDesktop({
        accessToken,
        refreshToken: accessToken,
        email: user.email,
        userId: String(user.id),
        expiresAt: null,
      })
      setStatus('linked')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '登录失败。')
      setStatus('error')
    }
  }

  // 跳转到标准登录页，并带上当前页面作为登录后的返回地址。
  function goToWebLogin(): void {
    const here =
      window.location.pathname + window.location.search + window.location.hash
    const target = `/sign-in?redirect=${encodeURIComponent(here)}`
    window.location.assign(target)
  }

  const card = (children: React.ReactNode) => (
    <main className="mx-auto mt-16 max-w-md px-4">
      <div className="rounded-2xl border border-border bg-card p-6">
        {children}
      </div>
    </main>
  )

  if (missingCallback) {
    return card(
      <>
        <h1 className="text-xl font-semibold">无法继续</h1>
        <p className="mt-2 text-sm text-destructive">
          缺少回调地址，请从 ZebraGate 桌面客户端重新打开此页面。
        </p>
      </>
    )
  }

  if (status === 'linked') {
    return (
      <main className="mx-auto mt-16 max-w-md px-4">
        <div className="rounded-2xl border border-border bg-card p-6 text-center">
          <h1 className="text-xl font-semibold">登录成功</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            ZebraGate 桌面客户端已完成登录，您可以关闭此窗口。
          </p>
          <button
            className="mt-4 w-full rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            type="button"
            onClick={() => window.close()}
          >
            关闭窗口
          </button>
        </div>
      </main>
    )
  }

  if (status === 'checking') {
    return card(
      <>
        <h1 className="text-xl font-semibold">登录 ZebraGate 桌面客户端</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          正在检查浏览器登录状态...
        </p>
      </>
    )
  }

  if (status === 'need-web-login') {
    return card(
      <>
        <h1 className="text-xl font-semibold">登录 ZebraGate 桌面客户端</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          您还没有在浏览器中登录 ZebraGate。请先登录，登录后将自动返回本页以完成桌面客户端授权。
        </p>
        <button
          className="mt-4 w-full rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          type="button"
          onClick={goToWebLogin}
        >
          去登录
        </button>
      </>
    )
  }

  // authorize / authorizing / error 共用授权确认页。
  const authorizing = status === 'authorizing'
  const displayName = user?.displayName || user?.username || ''

  return card(
    <>
      <h1 className="text-xl font-semibold">登录 ZebraGate 桌面客户端</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        将以下账号关联到 ZebraGate 桌面客户端：
      </p>
      <div className="mt-4 rounded-xl border border-border bg-background px-3 py-3">
        <div className="text-sm font-medium">{displayName}</div>
        {user?.email ? (
          <div className="mt-0.5 text-sm text-muted-foreground">
            {user.email}
          </div>
        ) : null}
      </div>
      {submitError ? (
        <p className="mt-3 text-sm text-destructive">{submitError}</p>
      ) : null}
      <button
        className="mt-4 w-full rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        type="button"
        disabled={authorizing}
        onClick={() => void handleAuthorize()}
      >
        {authorizing ? '正在关联...' : '登录到桌面客户端'}
      </button>
    </>
  )
}
