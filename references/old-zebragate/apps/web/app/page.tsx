import Link from "next/link";

export default function HomePage() {
  return (
    <main className="grid gap-8 md:grid-cols-[1.4fr_1fr]">
      <section className="rounded-3xl bg-ink px-8 py-10 text-white shadow-lg">
        <p className="text-sm uppercase tracking-[0.2em] text-emerald-200">ZebraGate MVP</p>
        <h1 className="mt-4 text-4xl font-semibold">Bring OpenAI-compatible desktop traffic through one controllable gateway.</h1>
        <p className="mt-4 max-w-2xl text-base text-slate-200">
          Website, API server, and Windows desktop client are scaffolded for credits, provider routing,
          and local proxy workflows.
        </p>
        <div className="mt-8 flex flex-wrap gap-4">
          <Link href="/download" className="rounded-full bg-white px-5 py-3 text-sm font-medium text-ink">
            Download Windows Client
          </Link>
          <Link href="/dashboard" className="rounded-full border border-white/20 px-5 py-3 text-sm font-medium">
            Enter Dashboard
          </Link>
        </div>
      </section>
      <section className="rounded-3xl border border-slate-200 bg-white p-8">
        <h2 className="text-xl font-semibold">Request Path</h2>
        <p className="mt-4 text-sm leading-7 text-slate-600">
          Chatbox / Cherry Studio / LobeChat -&gt; localhost:7788 -&gt; ZebraGate API -&gt; Provider Router
          -&gt; AI Provider
        </p>
        <p className="mt-4 text-sm text-slate-500">MVP only keeps metadata and credit records, not full conversation content.</p>
        <div className="mt-6 rounded-2xl bg-amber-50 p-4 text-sm leading-7 text-amber-800">
          ZebraGate 仅适合普通 AI 使用。请求内容会通过 ZebraGate 转发到第三方 AI 服务处理。请不要输入
          银行账号、身份证号、密码、API Key、私钥、助记词、公司机密等敏感内容。MVP 默认只记录基础
          统计信息，不保存完整对话内容。
        </div>
      </section>
    </main>
  );
}
