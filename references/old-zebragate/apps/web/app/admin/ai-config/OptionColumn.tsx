import Link from "next/link";
import type { AdminAiOptionRecord, AdminModelRecord, AdminProviderRecord } from "../../../lib/admin-api-client";
import {
  buildCollapseToggleHref,
  buildViewStateHref,
  filterOptionsBySelection,
  type AiConfigViewState
} from "./ai-config-layout.helpers";
import { TogglePillButton } from "./shared-ui";

export function OptionColumn({
  aiOptions,
  collapsed,
  models,
  providers,
  selectedProviderId,
  selectedModelId,
  toggleAiOptionFlagAction,
  viewState
}: {
  aiOptions: AdminAiOptionRecord[];
  collapsed: boolean;
  models: AdminModelRecord[];
  providers: AdminProviderRecord[];
  selectedProviderId: string;
  selectedModelId: string;
  toggleAiOptionFlagAction: (formData: FormData) => Promise<void>;
  viewState: AiConfigViewState;
}) {
  const visibleOptions = filterOptionsBySelection(aiOptions, selectedProviderId, selectedModelId);
  const toggleHref = buildCollapseToggleHref("/admin/ai-config", viewState, "option");

  if (collapsed) {
    return (
      <section className="flex max-h-[640px] flex-col items-center">
        <Link
          className="flex w-full flex-col items-center gap-2 border-b border-slate-200 bg-white px-1 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 hover:bg-slate-50"
          href={toggleHref}
          title="展开 AI Options"
        >
          <span>»</span>
        </Link>
        <div className="flex flex-1 flex-col items-center gap-1 overflow-y-auto px-1 py-2 text-xs text-slate-500">
          <span style={{ writingMode: "vertical-rl" }}>AI Options（{visibleOptions.length}）</span>
        </div>
      </section>
    );
  }

  return (
    <section className="flex max-h-[640px] flex-col">
      <div className="sticky top-0 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-2 py-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
          AI Options（{visibleOptions.length}）
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium"
            href={buildViewStateHref("/admin/ai-config", { ...viewState, optionAction: "create" })}
          >
            新增 AI Option
          </Link>
          <Link
            className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium"
            href={buildViewStateHref("/admin/ai-config", { ...viewState, optionAction: "generate" })}
          >
            批量生成 AI Option 建议
          </Link>
          <Link className="shrink-0 px-1 text-xs text-slate-400 hover:text-slate-600" href={toggleHref} title="收起 AI Options">
            «
          </Link>
        </div>
      </div>
      <div className="overflow-auto">
        <table className="min-w-[560px] text-left text-sm">
          <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2 py-1.5">名称</th>
              <th className="px-2 py-1.5">模型</th>
              <th className="px-2 py-1.5">倍率</th>
              <th className="px-2 py-1.5">标记</th>
              <th className="px-2 py-1.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibleOptions.length === 0 ? (
              <tr>
                <td className="px-2 py-2 text-sm text-slate-500" colSpan={5}>
                  暂无符合当前筛选条件的 AI Option。
                </td>
              </tr>
            ) : (
              visibleOptions.map((option) => {
                const model = models.find((candidate) => candidate.id === option.modelId);
                const provider = providers.find((candidate) => candidate.id === option.providerId);

                return (
                  <tr key={option.id}>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      <div className="font-medium">{option.publicName}</div>
                      <div className="text-xs text-slate-400">{provider?.providerLabel}</div>
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap text-xs text-slate-600">
                      {model?.modelLabel ?? option.modelId}
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap text-xs">
                      <span className={option.creditMultiplierOverridden ? "font-medium text-amber-700" : ""}>
                        x{option.creditMultiplier}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      <div className="flex gap-1">
                        <TogglePillButton
                          action={toggleAiOptionFlagAction}
                          active={option.isRecommended}
                          hiddenFields={{
                            optionId: option.id,
                            providerId: viewState.providerId,
                            modelId: viewState.modelId,
                            flag: "isRecommended",
                            nextValue: option.isRecommended ? "false" : "true"
                          }}
                        >
                          推荐
                        </TogglePillButton>
                        <TogglePillButton
                          action={toggleAiOptionFlagAction}
                          active={option.isPublic}
                          hiddenFields={{
                            optionId: option.id,
                            providerId: viewState.providerId,
                            modelId: viewState.modelId,
                            flag: "isPublic",
                            nextValue: option.isPublic ? "false" : "true"
                          }}
                        >
                          公开
                        </TogglePillButton>
                        <TogglePillButton
                          action={toggleAiOptionFlagAction}
                          active={option.isEnabled}
                          hiddenFields={{
                            optionId: option.id,
                            providerId: viewState.providerId,
                            modelId: viewState.modelId,
                            flag: "isEnabled",
                            nextValue: option.isEnabled ? "false" : "true"
                          }}
                        >
                          启用
                        </TogglePillButton>
                      </div>
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap text-right">
                      <Link
                        className="text-xs font-medium text-slate-500 underline"
                        href={buildViewStateHref("/admin/ai-config", {
                          ...viewState,
                          detailType: "option",
                          detailId: option.id
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
    </section>
  );
}
