import Link from "next/link";
import { getAdminAiTrace } from "../../../../lib/admin-api-client";

interface AdminAiTraceDetailPageProps {
  params: Promise<{
    traceId: string;
  }>;
}

export default async function AdminAiTraceDetailPage({ params }: AdminAiTraceDetailPageProps) {
  const { traceId } = await params;
  const trace = await getAdminAiTrace(traceId);

  return (
    <main className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">AI Trace 详情</h1>
          <p className="mt-1 font-mono text-sm text-slate-600">{trace.traceId}</p>
        </div>
        <div className="flex gap-4">
          <Link className="text-sm font-medium text-emerald-700" href="/admin/ai-traces">
            返回 Trace 列表
          </Link>
        </div>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">
        <div className="flex flex-wrap gap-4">
          <span>状态: {trace.status}</span>
          <span>入口模型: {trace.clientRequestModel ?? "-"}</span>
          <span>上游模型: {trace.resolvedUpstreamModel ?? "-"}</span>
          <span>Provider: {trace.providerLabel ?? trace.providerId ?? "-"}</span>
          <span>耗时: {trace.totalLatencyMs ?? "-"} ms</span>
          {trace.totalTokens !== null ? (
            <span className="font-medium text-slate-900">
              Token: {trace.inputTokens ?? "-"} 输入 / {trace.outputTokens ?? "-"} 输出 / {trace.totalTokens} 合计
            </span>
          ) : null}
        </div>
      </section>

      <section className="space-y-3">
        {trace.events.map((event) => (
          <article key={`${event.traceId}-${event.seqNo}`} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">#{event.seqNo}</span>
              <span className="font-medium text-slate-900">{event.stage}</span>
              <span className="text-slate-500">{event.component}</span>
              <span className="text-slate-500">{event.direction}</span>
              <span className="text-slate-500">{event.status}</span>
              <span className="text-slate-500">{event.occurredAt}</span>
              {event.httpStatus !== null ? <span className="text-slate-700">HTTP {event.httpStatus}</span> : null}
              {event.latencyMs !== null ? <span className="text-slate-700">{event.latencyMs} ms</span> : null}
            </div>

            {event.errorCode || event.errorMessage ? (
              <p className="mt-2 rounded-md bg-red-50 p-2 text-sm text-red-800">
                {event.errorCode ? `[${event.errorCode}] ` : ""}
                {event.errorMessage}
              </p>
            ) : null}

            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium text-emerald-700">查看 payload</summary>
              <pre className="mt-2 max-h-80 overflow-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">
                {formatJson(event.payloadJson)}
              </pre>
            </details>

            <details className="mt-2">
              <summary className="cursor-pointer text-sm font-medium text-slate-600">查看 headers / metadata</summary>
              <pre className="mt-2 max-h-80 overflow-auto rounded-md bg-slate-100 p-3 text-xs text-slate-700">
                {formatJson({ headers: event.headersJson, metadata: event.metadataJson })}
              </pre>
            </details>
          </article>
        ))}
      </section>
    </main>
  );
}

function formatJson(value: unknown): string {
  if (value === null || value === undefined) {
    return "(空)";
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
