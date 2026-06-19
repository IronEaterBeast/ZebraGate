"use client";

import { useState } from "react";
import type { AdminRuntimeTemplateRecord } from "../../../../lib/admin-api-client";
import { ParameterSchemaJsonField } from "./ParameterSchemaJsonField";

export function RuntimeTemplateUpdateForm({
  runtimeTemplate,
  action
}: {
  runtimeTemplate: AdminRuntimeTemplateRecord;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [isDirty, setIsDirty] = useState(false);

  return (
    <form action={action} className="grid gap-2" onChange={() => setIsDirty(true)}>
      <input name="runtimeTemplateId" type="hidden" value={runtimeTemplate.id} />
      <label className="grid gap-1 text-xs text-slate-600">
        <span>模板 Key</span>
        <input
          className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          defaultValue={runtimeTemplate.templateKey}
          name="templateKey"
          required
        />
      </label>
      <label className="grid gap-1 text-xs text-slate-600">
        <span>模板名称</span>
        <input
          className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          defaultValue={runtimeTemplate.name}
          name="name"
          required
        />
      </label>
      <label className="grid gap-1 text-xs text-slate-600">
        <span>说明</span>
        <textarea
          className="min-h-16 rounded-md border border-slate-300 px-2 py-1 text-sm"
          defaultValue={runtimeTemplate.description ?? ""}
          name="description"
        />
      </label>
      <ParameterSchemaJsonField
        defaultValue={JSON.stringify(runtimeTemplate.parameterSchemaJson ?? {}, null, 2)}
        name="parameterSchemaJson"
        onValueChange={() => setIsDirty(true)}
      />
      <label className="grid gap-1 text-xs text-slate-600">
        <span>备注</span>
        <input
          className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          defaultValue={runtimeTemplate.adminNote ?? ""}
          name="adminNote"
        />
      </label>
      <label className="flex items-center gap-2 text-xs text-slate-600">
        <input defaultChecked={runtimeTemplate.isEnabled} name="isEnabled" type="checkbox" />
        启用
      </label>
      <button
        className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium disabled:opacity-50"
        disabled={!isDirty}
        type="submit"
      >
        保存
      </button>
    </form>
  );
}
