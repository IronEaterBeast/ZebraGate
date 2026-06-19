"use client";

import { useEffect, useRef, useState } from "react";
import {
  mergeParametersIntoSchemaJson,
  parseParametersFromSchemaJson,
  parseRequestParameterFragment,
  type BuilderParameter
} from "./runtime-template-schema-builder";
import { buildGenerationPreview } from "./runtime-template-generation-preview";

export const PARAMETER_SCHEMA_GUIDE = {
  title: "作用",
  description:
    "这里定义模板里有哪些可选参数、每个参数有哪些候选值，以及每个候选值对应的请求片段、展示摘要文字、依赖关系和积分增量。批量生成 AI Option 建议时，会按这里的参数做笛卡尔组合，再用 requestParameterFragment 拼出实际请求参数，用 summary 拼出展示摘要（按参数声明顺序，用“ + ”连接非空 summary），用 creditMultiplierDelta 叠加到积分倍率上。",
  notes: [
    "internalKey 是这个候选值在参数维度内部的标识，仅用于 dependsOn 引用其他维度的候选值、以及在生成预览中标识这条组合，不会直接发送给上游模型。",
    "requestParameterFragment 才是真正会合并进发往上游模型请求体的内容，决定了选中这个候选值后实际请求会带上什么参数；它和 internalKey 之间没有自动推导关系，需要管理员手动保证两者语义一致。",
    "如果某个候选值代表“不改变默认行为”，通常应将 requestParameterFragment 写成 {}（不发送任何相关字段），而不是随意填一个值。",
    "dependsOn 用于声明“仅当其他维度选了某个候选值时，本候选值才会出现在生成结果里”。如果某个维度的全部候选值都依赖另一个维度的某个取值，那么当另一个维度选择其他取值时，这个维度会没有任何合法候选值，导致该组合整体被跳过——如果还想保留一个不依赖的“默认”选项，需要单独添加一个不带 dependsOn 的候选值。"
  ],
  example: {
    parameters: {
      thinking: {
        label: "Thinking",
        options: [
          {
            internalKey: "disabled",
            summary: "",
            requestParameterFragment: {},
            creditMultiplierDelta: 0
          },
          {
            internalKey: "enabled",
            summary: "思考",
            requestParameterFragment: { thinking: { type: "enabled" } },
            creditMultiplierDelta: 0.3
          }
        ]
      },
      reasoning_effort: {
        label: "Reasoning Effort",
        options: [
          {
            internalKey: "none",
            summary: "",
            requestParameterFragment: {},
            creditMultiplierDelta: 0
          },
          {
            internalKey: "max",
            summary: "强度最大",
            dependsOn: { thinking: "enabled" },
            requestParameterFragment: { reasoning_effort: "max" },
            creditMultiplierDelta: 0.8
          }
        ]
      }
    },
    requestDefaults: {
      temperature: 0.7
    },
    creditBaseMultiplier: null,
    creditCombinationRules: [{ when: { thinking: "enabled", reasoning_effort: "max" }, delta: 0.2 }]
  }
};

export const EMPTY_PARAMETER_SCHEMA_JSON = JSON.stringify({ parameters: {} }, null, 2);

interface NewOptionDraft {
  internalKey: string;
  summary: string;
  creditMultiplierDelta: string;
  requestParameterFragmentJson: string;
  dependsOn: Array<{ paramKey: string; internalKey: string }>;
}

function createEmptyOptionDraft(defaultDependency?: { paramKey: string; internalKey: string }): NewOptionDraft {
  return {
    internalKey: "",
    summary: "",
    creditMultiplierDelta: "",
    requestParameterFragmentJson: "",
    dependsOn: defaultDependency ? [defaultDependency] : []
  };
}

export function ParameterSchemaJsonField({
  name = "parameterSchemaJson",
  defaultValue,
  onValueChange
}: {
  name?: string;
  defaultValue: string;
  onValueChange?: () => void;
}) {
  const [parameterSchemaJsonText, setParameterSchemaJsonText] = useState(
    defaultValue.trim() ? defaultValue : EMPTY_PARAMETER_SCHEMA_JSON
  );
  const isFirstRenderRef = useRef(true);

  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }
    onValueChange?.();
  }, [parameterSchemaJsonText, onValueChange]);
  const [builderParameters, setBuilderParameters] = useState<BuilderParameter[]>([]);
  const [newParamKey, setNewParamKey] = useState("");
  const [newParamLabel, setNewParamLabel] = useState("");
  const [paramError, setParamError] = useState<string | null>(null);
  const [optionDrafts, setOptionDrafts] = useState<Record<string, NewOptionDraft>>({});
  const [optionErrors, setOptionErrors] = useState<Record<string, string | null>>({});
  const [editingOptionKeys, setEditingOptionKeys] = useState<Record<string, string | null>>({});

  function applyBuilderParameters(nextParameters: BuilderParameter[]): boolean {
    if (builderParameters.length === 0) {
      const trimmed = parameterSchemaJsonText.trim();
      const isDefault = trimmed === "" || trimmed === EMPTY_PARAMETER_SCHEMA_JSON;
      if (!isDefault) {
        const confirmed = window.confirm(
          "使用构造器将覆盖当前“参数结构 JSON”中的 parameters 部分，是否继续？"
        );
        if (!confirmed) {
          return false;
        }
      }
    }

    setBuilderParameters(nextParameters);
    setParameterSchemaJsonText(mergeParametersIntoSchemaJson(parameterSchemaJsonText, nextParameters));
    return true;
  }

  function handleLoadParametersFromJson() {
    const loaded = parseParametersFromSchemaJson(parameterSchemaJsonText);
    if (loaded.length === 0) {
      setParamError("当前“参数结构 JSON”中没有可识别的 parameters，无法加载。");
      return;
    }

    if (builderParameters.length > 0) {
      const confirmed = window.confirm("加载将替换构造器中当前的参数维度，是否继续？");
      if (!confirmed) {
        return;
      }
    }

    setBuilderParameters(loaded);
    setParamError(null);
  }

  function handleAddParameter() {
    const key = newParamKey.trim();
    if (!key) {
      setParamError("参数 key 为必填项。");
      return;
    }
    if (builderParameters.some((parameter) => parameter.key === key)) {
      setParamError("参数 key 已存在，请使用不同的 key。");
      return;
    }

    const applied = applyBuilderParameters([
      ...builderParameters,
      { key, label: newParamLabel.trim() || key, options: [] }
    ]);
    if (!applied) {
      return;
    }

    setNewParamKey("");
    setNewParamLabel("");
    setParamError(null);
  }

  function handleRemoveParameter(paramKey: string) {
    applyBuilderParameters(builderParameters.filter((parameter) => parameter.key !== paramKey));
  }

  function getDefaultDependency(paramKey: string): { paramKey: string; internalKey: string } | undefined {
    const otherParametersWithOptions = builderParameters.filter(
      (item) => item.key !== paramKey && item.options.length > 0
    );
    return otherParametersWithOptions.length > 0 ? { paramKey: "", internalKey: "" } : undefined;
  }

  function getOptionDraft(paramKey: string): NewOptionDraft {
    return optionDrafts[paramKey] ?? createEmptyOptionDraft(getDefaultDependency(paramKey));
  }

  function updateOptionDraft(paramKey: string, update: Partial<NewOptionDraft>) {
    setOptionDrafts((previous) => ({
      ...previous,
      [paramKey]: { ...getOptionDraft(paramKey), ...update }
    }));
  }

  function handleAddDependency(paramKey: string) {
    const otherParametersWithOptions = builderParameters.filter(
      (parameter) => parameter.key !== paramKey && parameter.options.length > 0
    );
    if (otherParametersWithOptions.length === 0) {
      return;
    }

    const draft = getOptionDraft(paramKey);
    updateOptionDraft(paramKey, {
      dependsOn: [...draft.dependsOn, { paramKey: "", internalKey: "" }]
    });
  }

  function handleRemoveDependency(paramKey: string, index: number) {
    const draft = getOptionDraft(paramKey);
    updateOptionDraft(paramKey, {
      dependsOn: draft.dependsOn.filter((_, dependencyIndex) => dependencyIndex !== index)
    });
  }

  function handleDependencyParamChange(paramKey: string, index: number, dependencyParamKey: string) {
    const draft = getOptionDraft(paramKey);
    const nextDependsOn = draft.dependsOn.map((dependency, dependencyIndex) =>
      dependencyIndex === index ? { paramKey: dependencyParamKey, internalKey: "" } : dependency
    );
    updateOptionDraft(paramKey, { dependsOn: nextDependsOn });
  }

  function handleDependencyValueChange(paramKey: string, index: number, dependencyInternalKey: string) {
    const draft = getOptionDraft(paramKey);
    const nextDependsOn = draft.dependsOn.map((dependency, dependencyIndex) =>
      dependencyIndex === index ? { ...dependency, internalKey: dependencyInternalKey } : dependency
    );
    updateOptionDraft(paramKey, { dependsOn: nextDependsOn });
  }

  function getEditingOptionKey(paramKey: string): string | null {
    return editingOptionKeys[paramKey] ?? null;
  }

  function handleStartEditOption(paramKey: string, option: BuilderParameter["options"][number]) {
    const dependsOn =
      option.dependsOn.length > 0
        ? option.dependsOn.map((dependency) => ({ ...dependency }))
        : (() => {
            const defaultDependency = getDefaultDependency(paramKey);
            return defaultDependency ? [defaultDependency] : [];
          })();

    setOptionDrafts((previous) => ({
      ...previous,
      [paramKey]: {
        internalKey: option.internalKey,
        summary: option.summary,
        creditMultiplierDelta: option.creditMultiplierDelta,
        requestParameterFragmentJson: option.requestParameterFragmentJson,
        dependsOn
      }
    }));
    setEditingOptionKeys((previous) => ({ ...previous, [paramKey]: option.internalKey }));
    setOptionErrors((previous) => ({ ...previous, [paramKey]: null }));
  }

  function handleCancelEditOption(paramKey: string) {
    setOptionDrafts((previous) => ({ ...previous, [paramKey]: createEmptyOptionDraft(getDefaultDependency(paramKey)) }));
    setEditingOptionKeys((previous) => ({ ...previous, [paramKey]: null }));
    setOptionErrors((previous) => ({ ...previous, [paramKey]: null }));
  }

  function handleAddOption(paramKey: string) {
    const draft = getOptionDraft(paramKey);
    const editingInternalKey = getEditingOptionKey(paramKey);
    const internalKey = draft.internalKey.trim();
    if (!internalKey) {
      setOptionErrors((previous) => ({ ...previous, [paramKey]: "内部标识为必填项。" }));
      return;
    }

    const parameter = builderParameters.find((item) => item.key === paramKey);
    const duplicate = parameter?.options.some(
      (option) => option.internalKey === internalKey && option.internalKey !== editingInternalKey
    );
    if (duplicate) {
      setOptionErrors((previous) => ({ ...previous, [paramKey]: "内部标识在该参数维度内已存在，请使用不同的标识。" }));
      return;
    }

    const fragmentResult = parseRequestParameterFragment(draft.requestParameterFragmentJson);
    if ("error" in fragmentResult) {
      setOptionErrors((previous) => ({ ...previous, [paramKey]: fragmentResult.error }));
      return;
    }

    if (draft.creditMultiplierDelta.trim() && !Number.isFinite(Number(draft.creditMultiplierDelta))) {
      setOptionErrors((previous) => ({ ...previous, [paramKey]: "积分增量必须是数字。" }));
      return;
    }

    const nextOption = {
      internalKey,
      summary: draft.summary,
      creditMultiplierDelta: draft.creditMultiplierDelta,
      requestParameterFragmentJson: draft.requestParameterFragmentJson,
      dependsOn: draft.dependsOn.filter((dependency) => dependency.paramKey && dependency.internalKey)
    };

    const nextParameters = builderParameters.map((item) =>
      item.key === paramKey
        ? {
            ...item,
            options:
              editingInternalKey !== null
                ? item.options.map((option) => (option.internalKey === editingInternalKey ? nextOption : option))
                : [...item.options, nextOption]
          }
        : item
    );

    const applied = applyBuilderParameters(nextParameters);
    if (!applied) {
      return;
    }

    setOptionDrafts((previous) => ({ ...previous, [paramKey]: createEmptyOptionDraft(getDefaultDependency(paramKey)) }));
    setOptionErrors((previous) => ({ ...previous, [paramKey]: null }));
    setEditingOptionKeys((previous) => ({ ...previous, [paramKey]: null }));
  }

  function handleRemoveOption(paramKey: string, internalKey: string) {
    if (getEditingOptionKey(paramKey) === internalKey) {
      handleCancelEditOption(paramKey);
    }
    applyBuilderParameters(
      builderParameters.map((item) =>
        item.key === paramKey
          ? { ...item, options: item.options.filter((option) => option.internalKey !== internalKey) }
          : item
      )
    );
  }

  const generationPreview = buildGenerationPreview(parameterSchemaJsonText);

  return (
    <label className="grid gap-1 text-xs text-slate-600">
      <span>参数结构 JSON</span>
      <textarea
        className="min-h-48 rounded-md border border-slate-300 px-2 py-1 font-mono text-xs"
        name={name}
        onChange={(event) => setParameterSchemaJsonText(event.target.value)}
        value={parameterSchemaJsonText}
      />
      <span className="text-[11px] text-slate-400">定义所有可选参数、可选值、请求片段、摘要文字和积分增量。</span>
      <details className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-2" open>
        <summary className="cursor-pointer text-[11px] font-semibold text-emerald-700">
          🔍 预览将生成的 AI Option 建议（{generationPreview.items.length} 条）
        </summary>
        <div className="mt-2 grid gap-2 text-[11px] text-slate-600">
          <div className="text-slate-500">
            假设基础积分倍率为 {"creditBaseMultiplier"} 字段的值（留空时按 1 估算），按当前“参数结构 JSON”中的
            parameters / requestDefaults / creditCombinationRules 计算。实际生成结果还会受所选 Model
            的基础积分倍率、以及是否已存在相同请求参数的 AI Option 影响。
          </div>
          {generationPreview.warnings.map((warning) => (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-amber-800" key={warning.message}>
              ⚠ {warning.message}
            </div>
          ))}
          {generationPreview.items.length === 0 && generationPreview.warnings.length === 0 ? (
            <div className="text-slate-400">当前没有定义任何参数维度，添加候选值后即可在此预览生成结果。</div>
          ) : null}
          {generationPreview.items.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-max border-collapse text-left">
                <thead>
                  <tr className="border-b border-emerald-200 text-emerald-800">
                    <th className="px-2 py-1 font-medium">参数组合</th>
                    <th className="px-2 py-1 font-medium">展示摘要</th>
                    <th className="px-2 py-1 font-medium">请求参数</th>
                    <th className="px-2 py-1 font-medium">积分倍率</th>
                  </tr>
                </thead>
                <tbody>
                  {generationPreview.items.map((item, index) => (
                    <tr className="border-b border-emerald-100 align-top" key={index}>
                      <td className="px-2 py-1 font-mono">
                        {Object.entries(item.normalizedParameterValues)
                          .map(([key, value]) => `${key}=${value}`)
                          .join(", ")}
                      </td>
                      <td className="px-2 py-1">{item.generatedConfigSummary || "（空）"}</td>
                      <td className="px-2 py-1">
                        <pre className="overflow-x-auto font-mono text-[11px]">
                          {JSON.stringify(item.requestParameters, null, 2)}
                        </pre>
                        {item.hasRequestParameterConflict ? (
                          <div className="mt-1 text-red-700">
                            ⚠ 请求参数冲突：{item.conflictDetails.join(", ")}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-2 py-1">{item.generatedCreditMultiplier}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </details>
      <details className="rounded-md border border-blue-200 bg-blue-50 px-2 py-2" open>
        <summary className="cursor-pointer text-[11px] font-semibold text-blue-700">🛠 使用构造器生成参数结构 JSON</summary>
        <div className="mt-2 grid gap-3 text-[11px] text-slate-600">
          <div className="grid gap-2 rounded-md border border-blue-200 bg-white px-2 py-2 shadow-sm">
            <div className="font-medium text-blue-800">添加参数维度</div>
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1">
                <span>参数 key</span>
                <input
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                  onChange={(event) => setNewParamKey(event.target.value)}
                  value={newParamKey}
                />
              </label>
              <label className="grid gap-1">
                <span>参数显示名（label）</span>
                <input
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                  onChange={(event) => setNewParamLabel(event.target.value)}
                  value={newParamLabel}
                />
              </label>
            </div>
            {paramError ? <div className="text-red-700">{paramError}</div> : null}
            <div className="flex flex-wrap gap-2">
              <button
                className="justify-self-start rounded-md border border-blue-300 bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800 hover:bg-blue-200"
                onClick={handleAddParameter}
                type="button"
              >
                添加参数维度
              </button>
              <button
                className="justify-self-start rounded-md border border-blue-300 px-2 py-1 text-xs font-medium text-blue-800 hover:bg-blue-100"
                onClick={handleLoadParametersFromJson}
                type="button"
              >
                从 JSON 加载已有参数维度
              </button>
            </div>
          </div>

          {builderParameters.map((parameter) => {
            const draft = getOptionDraft(parameter.key);
            const otherParameters = builderParameters.filter((item) => item.key !== parameter.key);
            const otherParametersWithOptions = otherParameters.filter((item) => item.options.length > 0);
            const optionError = optionErrors[parameter.key];

            return (
              <div className="grid gap-2 rounded-md border-2 border-blue-300 bg-white px-2 py-2 shadow-sm" key={parameter.key}>
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-blue-900">
                    {parameter.key}（{parameter.label}）
                  </div>
                  <button
                    className="rounded-md border border-slate-300 px-2 py-1 text-[11px] hover:bg-slate-50"
                    onClick={() => handleRemoveParameter(parameter.key)}
                    type="button"
                  >
                    删除参数维度
                  </button>
                </div>

                {parameter.options.length > 0 ? (
                  <ul className="grid gap-1">
                    {parameter.options.map((option) => {
                      const isEditing = getEditingOptionKey(parameter.key) === option.internalKey;
                      return (
                        <li
                          className={`flex items-center justify-between gap-2 rounded-md border-2 px-2 py-1.5 text-xs shadow-sm ${
                            isEditing ? "border-amber-400 bg-amber-50" : "border-blue-200 bg-blue-50"
                          }`}
                          key={option.internalKey}
                        >
                          <span>
                            <span className="font-semibold text-blue-900">{option.internalKey}</span>
                            {option.summary ? ` · summary: ${option.summary}` : ""}
                            {" · creditMultiplierDelta: "}
                            {option.creditMultiplierDelta || "0"}
                            {option.dependsOn.length > 0
                              ? ` · dependsOn: ${option.dependsOn
                                  .map((dependency) => `${dependency.paramKey}=${dependency.internalKey}`)
                                  .join(", ")}`
                              : ""}
                          </span>
                          <div className="flex shrink-0 gap-1">
                            <button
                              className="rounded-md border border-blue-300 bg-white px-2 py-1 text-[11px] font-medium text-blue-800 hover:bg-blue-100"
                              onClick={() => handleStartEditOption(parameter.key, option)}
                              type="button"
                            >
                              编辑
                            </button>
                            <button
                              className="rounded-md border border-slate-300 px-2 py-1 text-[11px] hover:bg-slate-50"
                              onClick={() => handleRemoveOption(parameter.key, option.internalKey)}
                              type="button"
                            >
                              删除
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}

                <div
                  className={`grid gap-2 rounded-md border px-2 py-2 ${
                    getEditingOptionKey(parameter.key) !== null
                      ? "border-amber-300 bg-amber-50"
                      : "border-dashed border-blue-300 bg-blue-50/40"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-blue-800">
                      {getEditingOptionKey(parameter.key) !== null
                        ? `编辑候选值：${getEditingOptionKey(parameter.key)}`
                        : "添加候选值"}
                    </div>
                    {getEditingOptionKey(parameter.key) !== null ? (
                      <button
                        className="rounded-md border border-slate-300 px-2 py-1 text-[11px] hover:bg-slate-50"
                        onClick={() => handleCancelEditOption(parameter.key)}
                        type="button"
                      >
                        取消编辑
                      </button>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="grid gap-1">
                      <span>内部标识（仅供内部识别和依赖关系引用，不会发送给上游）</span>
                      <input
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                        onChange={(event) => updateOptionDraft(parameter.key, { internalKey: event.target.value })}
                        value={draft.internalKey}
                      />
                    </label>
                    <label className="grid gap-1">
                      <span>summary</span>
                      <input
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                        onChange={(event) => updateOptionDraft(parameter.key, { summary: event.target.value })}
                        value={draft.summary}
                      />
                    </label>
                    <label className="grid gap-1">
                      <span>creditMultiplierDelta</span>
                      <input
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                        onChange={(event) =>
                          updateOptionDraft(parameter.key, { creditMultiplierDelta: event.target.value })
                        }
                        value={draft.creditMultiplierDelta}
                      />
                    </label>
                    <label className="col-span-2 grid gap-1">
                      <span>requestParameterFragment（JSON，可留空表示 {"{}"}）</span>
                      <input
                        className="rounded-md border border-slate-300 px-2 py-1 font-mono text-xs"
                        onChange={(event) =>
                          updateOptionDraft(parameter.key, { requestParameterFragmentJson: event.target.value })
                        }
                        value={draft.requestParameterFragmentJson}
                      />
                    </label>
                  </div>

                  <div className="grid gap-1">
                    <div className="flex items-center justify-between">
                      <span>依赖条件（dependsOn）</span>
                      <button
                        className="rounded-md border border-slate-300 px-2 py-1 text-[11px] disabled:opacity-50 hover:bg-slate-50"
                        disabled={otherParametersWithOptions.length === 0}
                        onClick={() => handleAddDependency(parameter.key)}
                        type="button"
                      >
                        添加依赖条件
                      </button>
                    </div>
                    {draft.dependsOn.length === 0 && otherParametersWithOptions.length === 0 ? (
                      <div className="text-[11px] text-slate-400">暂无其他含候选值的参数维度可供依赖。</div>
                    ) : null}
                    {draft.dependsOn.map((dependency, index) => {
                      const targetParameter = builderParameters.find((item) => item.key === dependency.paramKey);
                      return (
                        <div className="flex items-center gap-2" key={`${dependency.paramKey}-${index}`}>
                          <select
                            className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                            onChange={(event) =>
                              handleDependencyParamChange(parameter.key, index, event.target.value)
                            }
                            value={dependency.paramKey}
                          >
                            <option value="">请选择参数维度</option>
                            {otherParametersWithOptions.map((item) => (
                              <option key={item.key} value={item.key}>
                                {item.key}
                              </option>
                            ))}
                          </select>
                          <select
                            className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                            onChange={(event) =>
                              handleDependencyValueChange(parameter.key, index, event.target.value)
                            }
                            value={dependency.internalKey}
                          >
                            <option value="">请选择候选值</option>
                            {(targetParameter?.options ?? []).map((option) => (
                              <option key={option.internalKey} value={option.internalKey}>
                                {option.internalKey}
                              </option>
                            ))}
                          </select>
                          <button
                            className="rounded-md border border-slate-300 px-2 py-1 text-[11px] hover:bg-slate-50"
                            onClick={() => handleRemoveDependency(parameter.key, index)}
                            type="button"
                          >
                            删除
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {optionError ? <div className="text-red-700">{optionError}</div> : null}
                  <button
                    className="justify-self-start rounded-md border border-blue-300 bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800 hover:bg-blue-200"
                    onClick={() => handleAddOption(parameter.key)}
                    type="button"
                  >
                    {getEditingOptionKey(parameter.key) !== null ? "保存并关闭" : "添加候选值"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </details>
      <details className="rounded-md border border-slate-200 bg-slate-50 px-2 py-2">
        <summary className="cursor-pointer text-[11px] font-medium text-slate-600">查看填写说明与示例</summary>
        <div className="mt-2 grid gap-2 text-[11px] text-slate-500">
          <div className="font-medium text-slate-700">{PARAMETER_SCHEMA_GUIDE.title}</div>
          <div>{PARAMETER_SCHEMA_GUIDE.description}</div>
          <ul className="list-disc pl-4">
            {PARAMETER_SCHEMA_GUIDE.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
          <pre className="overflow-x-auto rounded-md bg-white px-2 py-2 font-mono text-[11px] text-slate-700">
            {JSON.stringify(PARAMETER_SCHEMA_GUIDE.example, null, 2)}
          </pre>
        </div>
      </details>
    </label>
  );
}
