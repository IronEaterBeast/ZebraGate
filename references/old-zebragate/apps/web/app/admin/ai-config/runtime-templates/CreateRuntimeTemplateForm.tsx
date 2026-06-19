"use client";

import { useActionState, useRef, useState } from "react";
import {
  createRuntimeTemplateFormAction,
  type CreateRuntimeTemplateFormState
} from "./runtime-template-actions";
import { ParameterSchemaJsonField } from "./ParameterSchemaJsonField";

const INITIAL_STATE: CreateRuntimeTemplateFormState = {
  errors: [],
  values: {
    templateKey: "",
    name: "",
    description: "",
    parameterSchemaJson: "",
    adminNote: "",
    isEnabled: false
  }
};

export function CreateRuntimeTemplateForm() {
  const [state, formAction, isPending] = useActionState(createRuntimeTemplateFormAction, INITIAL_STATE);
  const previousStateRef = useRef(state);
  const [formVersion, setFormVersion] = useState(0);
  const [isDirty, setIsDirty] = useState(false);

  if (previousStateRef.current !== state) {
    previousStateRef.current = state;
    if (state.errors.length === 0) {
      setFormVersion((version) => version + 1);
      setIsDirty(false);
    }
  }

  return (
    <form action={formAction} className="mt-3 grid gap-2" onChange={() => setIsDirty(true)}>
      {state.errors.length > 0 ? (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
          <div className="font-medium">新增运行参数模板失败：</div>
          <ul className="mt-1 list-disc pl-4">
            {state.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <label className="grid gap-1 text-xs text-slate-600">
        <span>模板 Key</span>
        <input
          className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          defaultValue={state.values.templateKey}
          name="templateKey"
          required
        />
      </label>
      <label className="grid gap-1 text-xs text-slate-600">
        <span>模板名称</span>
        <input
          className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          defaultValue={state.values.name}
          name="name"
          required
        />
      </label>
      <label className="grid gap-1 text-xs text-slate-600">
        <span>说明</span>
        <textarea
          className="min-h-16 rounded-md border border-slate-300 px-2 py-1 text-sm"
          defaultValue={state.values.description}
          name="description"
        />
      </label>
      <ParameterSchemaJsonField
        defaultValue={state.values.parameterSchemaJson}
        key={formVersion}
        onValueChange={() => setIsDirty(true)}
      />
      <label className="grid gap-1 text-xs text-slate-600">
        <span>备注</span>
        <input
          className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          defaultValue={state.values.adminNote}
          name="adminNote"
        />
      </label>
      <label className="flex items-center gap-2 text-xs text-slate-600">
        <input defaultChecked={state.values.isEnabled} name="isEnabled" type="checkbox" />
        启用
      </label>
      <button
        className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium disabled:opacity-50"
        disabled={isPending || !isDirty}
        type="submit"
      >
        新增
      </button>
    </form>
  );
}
