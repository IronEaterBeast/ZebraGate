"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CreditsCard } from "../../components/credits-card";
import { useAuth } from "../../lib/auth-context";
import {
  claimDailyCheckin,
  claimRegisterGift,
  getCredits,
  type DashboardPayload
} from "../../lib/api-client";
import type { CreditBatch, CreditLedgerEntry } from "@zebragate/shared";

export default function DashboardPage() {
  const router = useRouter();
  const { session, isLoading: isAuthLoading } = useAuth();
  const [credits, setCredits] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    if (!session) {
      router.push("/login");
      return;
    }

    void loadDashboardData();
  }, [isAuthLoading, session]);

  if (isAuthLoading || !session) {
    return null;
  }

  async function loadDashboardData(): Promise<void> {
    try {
      setError(null);
      const nextCredits = await getCredits();
      setCredits(nextCredits);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load credits.");
    }
  }

  function describeLedgerEntry(entry: CreditLedgerEntry): string {
    if (entry.sourceType === "register_gift") {
      return "注册礼包到账";
    }
    if (entry.sourceType === "daily_checkin") {
      return "每日签到到账";
    }
    if (entry.sourceType === "manual_grant") {
      return "管理员手动调整";
    }
    if (entry.sourceType === "purchase") {
      return "购买额度到账";
    }
    if (entry.sourceType === "refund") {
      return "退款到账";
    }

    if (entry.type === "debit") {
      const providerId = entry.metadata?.providerId;
      const aiOptionId = entry.metadata?.aiOptionId;
      if (typeof aiOptionId === "string" && aiOptionId.length > 0) {
        return `AI 调用扣费（${aiOptionId}）`;
      }
      if (typeof providerId === "string" && providerId.length > 0) {
        return `AI 调用扣费（${providerId}）`;
      }
      return "AI 调用扣费";
    }

    if (entry.type === "freeze") {
      return "额度冻结";
    }
    if (entry.type === "release") {
      return "额度解冻";
    }

    return "额度变动";
  }

  function formatLedgerTimestamp(createdAt: string): string {
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).format(new Date(createdAt));
  }

  function formatLedgerAmount(amount: number): string {
    return amount > 0 ? `+${amount}` : `${amount}`;
  }

  function formatDate(value: string): string {
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(value));
  }

  function describeBatchSourceType(sourceType: CreditBatch["sourceType"]): string {
    if (sourceType === "register_gift") {
      return "注册礼包";
    }
    if (sourceType === "daily_checkin") {
      return "每日签到";
    }
    if (sourceType === "manual_grant") {
      return "管理员手动调整";
    }
    if (sourceType === "purchase") {
      return "购买额度";
    }
    if (sourceType === "refund") {
      return "退款";
    }
    return sourceType;
  }

  async function handleAction(action: "register-gift" | "checkin"): Promise<void> {
    try {
      setIsSubmitting(true);
      setError(null);
      if (action === "register-gift") {
        await claimRegisterGift();
      } else {
        await claimDailyCheckin();
      }
      await loadDashboardData();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Credits action failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="grid gap-6">
      {error ? (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </section>
      ) : null}
      <section className="grid items-start gap-6 md:grid-cols-2">
        <CreditsCard balance={credits?.balance ?? 0} />
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Quick Actions</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              disabled={isSubmitting}
              onClick={() => void handleAction("register-gift")}
            >
              Register Gift
            </button>
            <button
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-60"
              disabled={isSubmitting}
              onClick={() => void handleAction("checkin")}
            >
              Daily Check-in
            </button>
          </div>
        </div>
      </section>
      <section className="grid items-start gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Credit Batches</h2>
          <ul className="mt-4 max-h-80 space-y-3 overflow-y-auto text-sm text-slate-600">
            {(credits?.batches ?? []).map((batch) => (
              <li key={batch.id} className="rounded-xl bg-slate-50 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-ink">{describeBatchSourceType(batch.sourceType)}</span>
                  <span className="font-semibold">
                    {batch.remainingCredits}/{batch.originalCredits}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
                  <span>获得时间：{formatDate(batch.createdAt)}</span>
                  <span>过期时间：{batch.expiresAt ? formatDate(batch.expiresAt) : "永久有效"}</span>
                </div>
              </li>
            ))}
            {(credits?.batches ?? []).length === 0 ? (
              <li className="rounded-xl bg-slate-50 p-3 text-center text-slate-400">暂无额度批次</li>
            ) : null}
          </ul>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Credit Ledger</h2>
          <ul className="mt-4 max-h-80 space-y-3 overflow-y-auto text-sm text-slate-600">
            {(credits?.ledger ?? []).map((entry) => (
              <li key={entry.id} className="rounded-xl bg-slate-50 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-ink">{describeLedgerEntry(entry)}</span>
                  <span className={entry.amount >= 0 ? "font-semibold text-emerald-600" : "font-semibold text-rose-600"}>
                    {formatLedgerAmount(entry.amount)}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
                  <span>{formatLedgerTimestamp(entry.createdAt)}</span>
                  <span>余额：{entry.balanceAfter}</span>
                </div>
                {entry.requestId ? (
                  <p className="mt-1 text-xs text-slate-400">请求 ID：{entry.requestId}</p>
                ) : null}
              </li>
            ))}
            {(credits?.ledger ?? []).length === 0 ? (
              <li className="rounded-xl bg-slate-50 p-3 text-center text-slate-400">暂无额度变动记录</li>
            ) : null}
          </ul>
        </div>
      </section>
    </main>
  );
}
