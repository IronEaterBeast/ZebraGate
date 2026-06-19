import Link from "next/link";
import { getAdminAiTraces, type AdminAiTraceListItem } from "../../../lib/admin-api-client";

interface AdminAiTracesPageProps {
  searchParams?: Promise<{
    page?: string;
    status?: string;
    providerId?: string;
    traceId?: string;
  }>;
}

const PAGE_SIZE = 20;

const STATUS_STYLES: Record<string, string> = {
  started: "bg-sky-100 text-sky-800",
  success: "bg-emerald-100 text-emerald-800",
  error: "bg-red-100 text-red-800",
  blocked: "bg-amber-100 text-amber-800",
  streaming: "bg-indigo-100 text-indigo-800"
};

export default async function AdminAiTracesPage({ searchParams }: AdminAiTracesPageProps) {
  const params = (await searchParams) ?? {};
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const status = params.status || undefined;
  const providerId = params.providerId || undefined;
  const traceId = params.traceId || undefined;
  const result = await getAdminAiTraces({ page, pageSize: PAGE_SIZE, status, providerId, traceId });
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <main className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">AI 全链路追踪</h1>
        <p className="mt-1 text-sm text-slate-600">
          查看 desktop、server 与上游 AI 的完整调用链路。当前共 {result.total} 条 trace。
        </p>
      </header>

      <form className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4" method="get">
        <label className="flex flex-col text-sm text-slate-600">
          状态
          <input className="mt-1 rounded-md border border-slate-300 px-2 py-1" defaultValue={status ?? ""} name="status" type="text" />
        </label>
        <label className="flex flex-col text-sm text-slate-600">
          Provider ID
          <input className="mt-1 rounded-md border border-slate-300 px-2 py-1" defaultValue={providerId ?? ""} name="providerId" type="text" />
        </label>
        <label className="flex flex-col text-sm text-slate-600">
          Trace ID
          <input className="mt-1 rounded-md border border-slate-300 px-2 py-1" defaultValue={traceId ?? ""} name="traceId" type="text" />
        </label>
        <button className="rounded-md bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white" type="submit">
          筛选
        </button>
      </form>

      <div className="space-y-3">
        {result.items.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">暂无 trace 记录。</p>
        ) : (
          result.items.map((item) => <TraceCard key={item.traceId} item={item} />)
        )}
      </div>

      <nav className="flex items-center justify-center gap-4 text-sm">
        <PageLink disabled={page <= 1} label="上一页" params={{ ...params, page: String(page - 1) }} />
        <span className="text-slate-600">第 {page} / {totalPages} 页</span>
        <PageLink disabled={page >= totalPages} label="下一页" params={{ ...params, page: String(page + 1) }} />
      </nav>
    </main>
  );
}

function TraceCard({ item }: { item: AdminAiTraceListItem }) {
  const statusStyle = STATUS_STYLES[item.status] ?? "bg-slate-100 text-slate-700";

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className={`rounded-md px-2 py-1 text-xs font-medium ${statusStyle}`}>{item.status}</span>
        <span className="font-mono text-slate-600">{item.traceId}</span>
        <span className="text-slate-500">{item.startedAt}</span>
        <span className="text-slate-700">Provider: {item.providerLabel ?? item.providerId ?? "-"}</span>
        <span className="text-slate-700">上游模型: {item.resolvedUpstreamModel ?? "-"}</span>
        <span className="text-slate-700">入口模型: {item.clientRequestModel ?? "-"}</span>
        <span className="text-slate-700">耗时: {item.totalLatencyMs ?? "-"} ms</span>
        {item.totalTokens !== null ? (
          <span className="text-slate-700">Token: {item.inputTokens ?? "-"}↑ {item.outputTokens ?? "-"}↓ {item.totalTokens}总</span>
        ) : null}
        {item.isStream ? <span className="text-slate-500">(流式)</span> : null}
      </div>

      {item.errorCode || item.errorMessage ? (
        <p className="mt-2 rounded-md bg-red-50 p-2 text-sm text-red-800">
          {item.errorCode ? `[${item.errorCode}] ` : ""}
          {item.errorMessage}
        </p>
      ) : null}

      <div className="mt-3">
        <Link className="text-sm font-medium text-emerald-700" href={`/admin/ai-traces/${encodeURIComponent(item.traceId)}`}>
          查看完整时间线
        </Link>
      </div>
    </article>
  );
}

function PageLink({
  label,
  params,
  disabled
}: {
  label: string;
  params: Record<string, string | undefined>;
  disabled: boolean;
}) {
  if (disabled) {
    return <span className="rounded-md border border-slate-200 px-3 py-1 text-slate-400">{label}</span>;
  }

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      query.set(key, value);
    }
  }

  return (
    <Link className="rounded-md border border-slate-300 px-3 py-1 text-emerald-700" href={`?${query.toString()}`}>
      {label}
    </Link>
  );
}
