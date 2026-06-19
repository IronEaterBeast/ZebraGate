import type { ReactNode } from "react";
import { ADMIN_AI_CONFIG_STATUS_OPTIONS } from "../../../lib/admin-ai-config-status";
import type { AdminAiOptionPreviewItem } from "../../../lib/admin-api-client";

export function StatusPill({ enabled, status }: { enabled: boolean; status: string }) {
  return (
    <span
      className={`rounded-md px-2 py-1 text-xs font-medium ${
        enabled && status !== "disabled" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
      }`}
    >
      {enabled ? status : "disabled"}
    </span>
  );
}

export function TogglePillButton({
  action,
  active,
  children,
  hiddenFields
}: {
  action: (formData: FormData) => Promise<void>;
  active: boolean;
  children: ReactNode;
  hiddenFields: Record<string, string>;
}) {
  return (
    <form action={action}>
      {Object.entries(hiddenFields).map(([name, value]) => (
        <input key={name} name={name} type="hidden" value={value} />
      ))}
      <button
        className={`rounded-md px-2 py-1 text-xs ${active ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}
        type="submit"
      >
        {children}
      </button>
    </form>
  );
}

export function getStatusOptions(currentStatus: string): string[] {
  if (ADMIN_AI_CONFIG_STATUS_OPTIONS.includes(currentStatus as (typeof ADMIN_AI_CONFIG_STATUS_OPTIONS)[number])) {
    return [...ADMIN_AI_CONFIG_STATUS_OPTIONS];
  }

  return [currentStatus, ...ADMIN_AI_CONFIG_STATUS_OPTIONS];
}

export function ActionPill({ action }: { action: AdminAiOptionPreviewItem["action"] }) {
  const classNameByAction: Record<AdminAiOptionPreviewItem["action"], string> = {
    create: "bg-blue-100 text-blue-800",
    exists: "bg-slate-100 text-slate-600",
    update: "bg-amber-100 text-amber-800",
    conflict: "bg-red-100 text-red-800"
  };

  const labelByAction: Record<AdminAiOptionPreviewItem["action"], string> = {
    create: "新增",
    exists: "已存在",
    update: "更新",
    conflict: "冲突"
  };

  return <span className={`rounded-md px-2 py-1 text-xs font-medium ${classNameByAction[action]}`}>{labelByAction[action]}</span>;
}

export function JsonTextareaField({
  defaultValue,
  guide,
  helpText,
  label,
  name
}: {
  defaultValue: unknown;
  guide?: {
    title: string;
    description: string;
    notes?: string[];
    example: unknown;
  };
  helpText?: string;
  label: string;
  name: string;
}) {
  return (
    <label className="grid gap-1 text-xs text-slate-600">
      <span>{label}</span>
      <textarea
        className="min-h-24 rounded-md border border-slate-300 px-2 py-1 font-mono text-xs"
        defaultValue={JSON.stringify(defaultValue ?? {}, null, 2)}
        name={name}
      />
      {helpText ? <span className="text-[11px] text-slate-400">{helpText}</span> : null}
      {guide ? (
        <details className="rounded-md border border-slate-200 bg-slate-50 px-2 py-2">
          <summary className="cursor-pointer text-[11px] font-medium text-slate-600">查看填写说明与示例</summary>
          <div className="mt-2 grid gap-2 text-[11px] text-slate-500">
            <div className="font-medium text-slate-700">{guide.title}</div>
            <div>{guide.description}</div>
            {guide.notes && guide.notes.length > 0 ? (
              <ul className="list-disc pl-4">
                {guide.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            ) : null}
            <pre className="overflow-x-auto rounded-md bg-white px-2 py-2 font-mono text-[11px] text-slate-700">
              {JSON.stringify(guide.example, null, 2)}
            </pre>
          </div>
        </details>
      ) : null}
    </label>
  );
}

export const ACTUAL_REQUEST_PARAMETERS_GUIDE = {
  title: "作用",
  description:
    "这里填写的是服务器最终发给 provider 的请求参数。也就是说，用户选中 AI Option 后，服务器会按这里的结构组装请求并调用上游模型。",
  example: {
    model: "gpt-5",
    thinking: true,
    reasoning_effort: "high",
    temperature: 0.7
  }
};
