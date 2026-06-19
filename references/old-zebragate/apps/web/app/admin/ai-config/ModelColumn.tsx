import Link from "next/link";
import type { AdminAiOptionRecord, AdminModelRecord, AdminRuntimeTemplateRecord } from "../../../lib/admin-api-client";
import {
  ALL_SELECTION,
  buildCollapseToggleHref,
  buildSelectionHref,
  buildViewStateHref,
  filterModelsByProvider,
  type AiConfigViewState
} from "./ai-config-layout.helpers";

export function ModelColumn({
  aiOptions,
  collapsed,
  models,
  runtimeTemplates,
  selectedProviderId,
  selectedModelId,
  viewState
}: {
  aiOptions: AdminAiOptionRecord[];
  collapsed: boolean;
  models: AdminModelRecord[];
  runtimeTemplates: AdminRuntimeTemplateRecord[];
  selectedProviderId: string;
  selectedModelId: string;
  viewState: AiConfigViewState;
}) {
  const current = { ...viewState, providerId: selectedProviderId, modelId: selectedModelId };
  const visibleModels = filterModelsByProvider(models, selectedProviderId);
  const toggleHref = buildCollapseToggleHref("/admin/ai-config", viewState, "model");

  if (collapsed) {
    const selectedModel = visibleModels.find((model) => model.id === selectedModelId);

    return (
      <section className="flex max-h-[640px] flex-col items-center">
        <Link
          className="flex w-full flex-col items-center gap-2 border-b border-slate-200 bg-white px-1 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 hover:bg-slate-50"
          href={toggleHref}
          title="展开 Models"
        >
          <span>»</span>
        </Link>
        <div className="flex flex-1 flex-col items-center gap-1 overflow-y-auto px-1 py-2 text-xs text-slate-500">
          <span style={{ writingMode: "vertical-rl" }}>Models</span>
          {selectedModel ? (
            <span className="mt-2 rounded bg-emerald-100 px-1 py-0.5 font-semibold text-emerald-800" style={{ writingMode: "vertical-rl" }}>
              {selectedModel.modelLabel}
            </span>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section className="flex max-h-[640px] flex-col">
      <div className="sticky top-0 flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-2 py-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Models</h2>
        <Link className="shrink-0 px-1 text-xs text-slate-400 hover:text-slate-600" href={toggleHref} title="收起 Models">
          «
        </Link>
      </div>
      <div className="overflow-auto">
        <table className="min-w-[360px] text-left text-sm">
          <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2 py-1.5">名称</th>
              <th className="px-2 py-1.5">Option 数</th>
              <th className="px-2 py-1.5">倍率</th>
              <th className="px-2 py-1.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr
              className={
                selectedModelId === ALL_SELECTION
                  ? "border-l-4 border-emerald-500 bg-emerald-100 font-semibold text-emerald-900"
                  : "border-l-4 border-transparent font-medium hover:bg-slate-50"
              }
            >
              <td className="px-2 py-1.5 whitespace-nowrap" colSpan={4}>
                <Link className="block" href={buildSelectionHref("/admin/ai-config", current, { modelId: ALL_SELECTION })}>
                  全部 Model
                </Link>
              </td>
            </tr>
            {visibleModels.length === 0 ? (
              <tr>
                <td className="px-2 py-2 text-sm text-slate-500" colSpan={4}>
                  {selectedProviderId === ALL_SELECTION ? "暂无 Model。" : "该 Provider 下暂无 Model。"}
                </td>
              </tr>
            ) : (
              visibleModels.map((model) => {
                const optionCount = aiOptions.filter((option) => option.modelId === model.id).length;
                const runtimeTemplate = runtimeTemplates.find((candidate) => candidate.id === model.runtimeTemplateId);
                const isSelected = model.id === selectedModelId;

                return (
                  <tr
                    key={model.id}
                    className={`border-l-4 text-sm ${
                      isSelected ? "border-emerald-500 bg-emerald-100 font-semibold text-emerald-900" : "border-transparent hover:bg-slate-50"
                    }`}
                  >
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      <Link
                        className="block"
                        href={buildSelectionHref("/admin/ai-config", current, { modelId: model.id })}
                        title={`${model.upstreamModel} · 运行参数模板：${runtimeTemplate ? `${runtimeTemplate.name} (${runtimeTemplate.templateKey})` : "未绑定"}`}
                      >
                        {model.modelLabel}
                      </Link>
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap text-xs text-slate-400">{optionCount}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap text-xs text-slate-500">x{model.baseCreditMultiplier}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap text-right">
                      <Link
                        className="text-xs font-medium text-slate-500 underline"
                        href={buildViewStateHref("/admin/ai-config", {
                          ...viewState,
                          providerId: selectedProviderId,
                          modelId: selectedModelId,
                          detailType: "model",
                          detailId: model.id
                        })}
                      >
                        编辑
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <div className="border-t border-slate-200 px-2 py-2">
        {selectedProviderId === ALL_SELECTION ? (
          <p className="text-xs text-slate-500">请先选择左侧某个 Provider，再新增 Model。</p>
        ) : (
          <Link
            className="text-xs font-medium text-slate-600 underline"
            href={buildViewStateHref("/admin/ai-config", {
              ...viewState,
              providerId: selectedProviderId,
              modelId: selectedModelId,
              detailType: "model",
              detailId: "new"
            })}
          >
            新增 Model
          </Link>
        )}
      </div>
    </section>
  );
}
