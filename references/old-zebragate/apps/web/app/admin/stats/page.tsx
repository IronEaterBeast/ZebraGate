import { getMockStats } from "../../../lib/api-client";

export default async function AdminStatsPage() {
  const stats = await getMockStats();

  return (
    <main className="grid gap-6 md:grid-cols-4">
      <article className="rounded-2xl border border-slate-200 bg-white p-6">
        <p className="text-sm text-slate-500">Requests</p>
        <p className="mt-2 text-3xl font-semibold">{stats.requestCount}</p>
      </article>
      <article className="rounded-2xl border border-slate-200 bg-white p-6">
        <p className="text-sm text-slate-500">Success Rate</p>
        <p className="mt-2 text-3xl font-semibold">{stats.successRate}</p>
      </article>
      <article className="rounded-2xl border border-slate-200 bg-white p-6">
        <p className="text-sm text-slate-500">Failure Rate</p>
        <p className="mt-2 text-3xl font-semibold">{stats.failureRate}</p>
      </article>
      <article className="rounded-2xl border border-slate-200 bg-white p-6">
        <p className="text-sm text-slate-500">Budget Used</p>
        <p className="mt-2 text-3xl font-semibold">{stats.budgetUsed}</p>
      </article>
    </main>
  );
}
