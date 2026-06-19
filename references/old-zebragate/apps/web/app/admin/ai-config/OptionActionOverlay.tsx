import Link from "next/link";
import type {
  AdminAiOptionPreviewItem,
  AdminAiOptionRecord,
  AdminModelRecord,
  AdminProviderRecord,
  AdminRuntimeTemplateRecord
} from "../../../lib/admin-api-client";
import { ALL_SELECTION, buildViewStateHref, filterModelsByProvider, type AiConfigViewState } from "./ai-config-layout.helpers";
import { ACTUAL_REQUEST_PARAMETERS_GUIDE, ActionPill, JsonTextareaField } from "./shared-ui";
import { ADMIN_AI_CONFIG_STATUS_OPTIONS } from "../../../lib/admin-ai-config-status";

interface OptionActionOverlayProps {
  optionAction: string;
  viewState: AiConfigViewState;
  models: AdminModelRecord[];
  providers: AdminProviderRecord[];
  aiOptions: AdminAiOptionRecord[];
  runtimeTemplates: AdminRuntimeTemplateRecord[];
  preview: AdminAiOptionPreviewItem[];
  createAiOptionAction: (formData: FormData) => Promise<void>;
  applyGenerationAction: (formData: FormData) => Promise<void>;
  applyGenerationItemAction: (formData: FormData) => Promise<void>;
}

export function OptionActionOverlay(props: OptionActionOverlayProps) {
  const { optionAction } = props;

  if (optionAction === "create") {
    return <CreateOptionOverlay {...props} />;
  }

  if (optionAction === "generate") {
    return <GenerationPreviewOverlay {...props} />;
  }

  return null;
}

function OverlayShell({ title, closeHref, children }: { title: string; closeHref: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">{title}</h2>
        <Link className="text-xs font-medium text-slate-500 underline" href={closeHref}>
          关闭
        </Link>
      </div>
      <div className="px-4 py-4">{children}</div>
    </section>
  );
}

function CreateOptionOverlay({ viewState, models, providers, createAiOptionAction }: OptionActionOverlayProps) {
  const closeHref = buildViewStateHref("/admin/ai-config", { providerId: viewState.providerId, modelId: viewState.modelId });
  const candidateModels = filterModelsByProvider(models, viewState.providerId);
  const defaultModelId = viewState.modelId !== ALL_SELECTION ? viewState.modelId : candidateModels[0]?.id ?? "";

  return (
    <OverlayShell closeHref={closeHref} title="新增 AI Option">
      {candidateModels.length === 0 ? (
        <p className="text-sm text-slate-500">暂无 Model，请先创建 Model。</p>
      ) : (
        <form action={createAiOptionAction} className="grid gap-3 md:max-w-xl">
          <label className="grid gap-1 text-sm text-slate-600">
            <span>所属 Model</span>
            <select className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" defaultValue={defaultModelId} name="modelId">
              {candidateModels.map((model) => {
                const provider = providers.find((candidate) => candidate.id === model.providerId);
                const optionLabel = [model.modelLabel, provider?.providerLabel].filter(Boolean).join(" / ");

                return (
                  <option key={model.id} value={model.id}>
                    {optionLabel}
                  </option>
                );
              })}
            </select>
          </label>
          <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
            AI Option 自身就包含最终要发给 provider 的实际运行参数，所以这里直接选择 Model，然后填写本条 AI Option 的实际参数。
          </div>
          <label className="grid gap-1 text-sm text-slate-600">
            <span>公开名称</span>
            <input className="rounded-md border border-slate-300 px-3 py-2 text-sm" name="publicName" />
          </label>
          <JsonTextareaField
            defaultValue={{}}
            guide={ACTUAL_REQUEST_PARAMETERS_GUIDE}
            helpText="这里填写最终发给 provider 的请求参数。"
            label="请求参数 JSON"
            name="actualRequestParametersJson"
          />
          <label className="grid gap-1 text-sm text-slate-600">
            <span>展示摘要</span>
            <textarea className="min-h-16 rounded-md border border-slate-300 px-3 py-2 text-sm" name="displayConfigSummary" />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input name="displayConfigSummaryOverridden" type="checkbox" />
            覆盖展示摘要
          </label>
          <label className="grid gap-1 text-sm text-slate-600">
            <span>积分倍率</span>
            <input className="rounded-md border border-slate-300 px-3 py-2 text-sm" min="0" name="creditMultiplier" step="0.01" type="number" />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input name="creditMultiplierOverridden" type="checkbox" />
            覆盖积分倍率
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-sm text-slate-600">
              <span>状态</span>
              <select className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" defaultValue="unknown" name="status">
                {ADMIN_AI_CONFIG_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm text-slate-600">
              <span>健康</span>
              <select className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" defaultValue="unknown" name="healthStatus">
                {ADMIN_AI_CONFIG_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-slate-600">
            <label className="flex items-center gap-1">
              <input name="isRecommended" type="checkbox" />
              推荐
            </label>
            <label className="flex items-center gap-1">
              <input name="isPublic" type="checkbox" />
              公开
            </label>
            <label className="flex items-center gap-1">
              <input name="isEnabled" type="checkbox" />
              启用
            </label>
          </div>
          <button className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium" type="submit">
            新增
          </button>
        </form>
      )}
    </OverlayShell>
  );
}

function GenerationPreviewOverlay({
  viewState,
  models,
  aiOptions,
  runtimeTemplates,
  preview,
  applyGenerationAction,
  applyGenerationItemAction
}: OptionActionOverlayProps) {
  const closeHref = buildViewStateHref("/admin/ai-config", { providerId: viewState.providerId, modelId: viewState.modelId });

  if (viewState.modelId === ALL_SELECTION) {
    return (
      <OverlayShell closeHref={closeHref} title="批量生成 AI Option 建议">
        <p className="text-sm text-slate-500">请先在中间列选择一个具体的 Model，再生成 AI Option 建议。</p>
      </OverlayShell>
    );
  }

  const model = models.find((candidate) => candidate.id === viewState.modelId);
  if (!model) {
    return null;
  }

  const runtimeTemplate = runtimeTemplates.find((candidate) => candidate.id === model.runtimeTemplateId) ?? null;
  const counts = preview.reduce<Record<string, number>>((total, item) => {
    total[item.action] = (total[item.action] ?? 0) + 1;
    return total;
  }, {});

  return (
    <OverlayShell closeHref={closeHref} title={`批量生成 AI Option 建议：${model.modelLabel}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-xs text-slate-500">
          <span>当前模板：{runtimeTemplate?.name ?? "未绑定"}</span>
          <span>{aiOptions.filter((option) => option.modelId === model.id).length} 个现有 AI Option</span>
          <span>{counts.create ?? 0} 个新增</span>
          <span>{counts.exists ?? 0} 个已存在</span>
          <span>{counts.update ?? 0} 个更新</span>
          <span>{counts.conflict ?? 0} 个冲突</span>
        </div>
        {runtimeTemplate ? (
          <form action={applyGenerationAction}>
            <input name="runtimeTemplateId" type="hidden" value={runtimeTemplate.id} />
            <input name="providerId" type="hidden" value={viewState.providerId} />
            <input name="modelId" type="hidden" value={model.id} />
            <button className="rounded-md bg-emerald-700 px-3 py-2 text-xs font-medium text-white" type="submit">
              应用建议
            </button>
          </form>
        ) : null}
      </div>
      {!runtimeTemplate ? (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          当前选中的 Model 还没有绑定运行参数模板，所以暂时无法生成 AI Option 建议。
        </div>
      ) : preview.length === 0 ? (
        <div className="mb-3 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          当前模板还没有定义可展开的参数组合，所以暂时没有可生成的 AI Option 建议。
        </div>
      ) : null}
      <div className="max-h-[420px] overflow-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">操作</th>
              <th className="px-4 py-3">名称</th>
              <th className="px-4 py-3">参数值</th>
              <th className="px-4 py-3">倍率</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {preview.map((item) => (
              <tr key={JSON.stringify(item.normalizedParameterValues)} className="align-top">
                <td className="px-4 py-3">
                  <ActionPill action={item.action} />
                  {item.conflictDetails.length > 0 ? (
                    <div className="mt-1 text-xs text-red-600">{item.conflictDetails.join(", ")}</div>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium">{item.publicName}</div>
                  <div className="mt-1 text-xs text-slate-500">{item.displayConfigSummary || "默认"}</div>
                </td>
                <td className="px-4 py-3">
                  <code className="text-xs text-slate-600">{JSON.stringify(item.normalizedParameterValues)}</code>
                </td>
                <td className="px-4 py-3 text-sm">
                  x{item.creditMultiplier}
                  {item.creditMultiplierOverridden ? <span className="ml-1 text-xs text-amber-700">手动覆盖</span> : null}
                </td>
                <td className="px-4 py-3 text-right">
                  {runtimeTemplate && (item.action === "create" || item.action === "update") ? (
                    <form action={applyGenerationItemAction}>
                      <input name="runtimeTemplateId" type="hidden" value={runtimeTemplate.id} />
                      <input name="providerId" type="hidden" value={viewState.providerId} />
                      <input name="modelId" type="hidden" value={model.id} />
                      <input name="normalizedParameterValuesJson" type="hidden" value={JSON.stringify(item.normalizedParameterValues)} />
                      <button className="rounded-md border border-emerald-700 px-2 py-1 text-xs font-medium text-emerald-700" type="submit">
                        应用
                      </button>
                    </form>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </OverlayShell>
  );
}
