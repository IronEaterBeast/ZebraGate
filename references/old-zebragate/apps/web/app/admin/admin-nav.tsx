import Link from "next/link";

const ADMIN_NAV_ITEMS = [
  { href: "/admin", label: "管理首页" },
  { href: "/admin/ai-config", label: "AI 配置" },
  { href: "/admin/ai-traces", label: "AI 全链路追踪" },
  { href: "/admin/stats", label: "Stats" }
] as const;

export function AdminNav() {
  return (
    <nav className="mb-6 flex flex-wrap items-center gap-4 border-b border-slate-200 pb-4 text-sm font-medium text-emerald-700">
      {ADMIN_NAV_ITEMS.map((item) => (
        <Link key={item.href} href={item.href}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
