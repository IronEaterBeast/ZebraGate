import Link from "next/link";
import type { AdminModelRecord, AdminProviderRecord } from "../../../lib/admin-api-client";
import {
  ALL_SELECTION,
  buildCollapseToggleHref,
  buildSelectionHref,
  buildViewStateHref,
  type AiConfigViewState
} from "./ai-config-layout.helpers";
import { StatusPill } from "./shared-ui";

export function ProviderColumn({
  collapsed,
  models,
  providers,
  selectedProviderId,
  selectedModelId,
  viewState
}: {
  collapsed: boolean;
  models: AdminModelRecord[];
  providers: AdminProviderRecord[];
  selectedProviderId: string;
  selectedModelId: string;
  viewState: AiConfigViewState;
}) {
  const current = { ...viewState, providerId: selectedProviderId, modelId: selectedModelId };
  const toggleHref = buildCollapseToggleHref("/admin/ai-config", viewState, "provider");

  if (collapsed) {
    const selectedProvider = providers.find((provider) => provider.id === selectedProviderId);

    return (
      <section className="flex max-h-[640px] flex-col items-center">
        <Link
          className="flex w-full flex-col items-center gap-2 border-b border-slate-200 bg-white px-1 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 hover:bg-slate-50"
          href={toggleHref}
          title="展开 Providers"
        >
          <span>»</span>
        </Link>
        <div className="flex flex-1 flex-col items-center gap-1 overflow-y-auto px-1 py-2 text-xs text-slate-500">
          <span style={{ writingMode: "vertical-rl" }}>Providers</span>
          {selectedProvider ? (
            <span className="mt-2 rounded bg-emerald-100 px-1 py-0.5 font-semibold text-emerald-800" style={{ writingMode: "vertical-rl" }}>
              {selectedProvider.providerLabel}
            </span>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section className="flex max-h-[640px] flex-col">
      <div className="sticky top-0 flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-2 py-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Providers</h2>
        <Link className="shrink-0 px-1 text-xs text-slate-400 hover:text-slate-600" href={toggleHref} title="收起 Providers">
          «
        </Link>
      </div>
      <div className="overflow-auto">
        <table className="min-w-[360px] text-left text-sm">
          <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2 py-1.5">名称</th>
              <th className="px-2 py-1.5">Model 数</th>
              <th className="px-2 py-1.5">状态</th>
              <th className="px-2 py-1.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr
              className={
                selectedProviderId === ALL_SELECTION
                  ? "border-l-4 border-emerald-500 bg-emerald-100 font-semibold text-emerald-900"
                  : "border-l-4 border-transparent font-medium hover:bg-slate-50"
              }
            >
              <td className="px-2 py-1.5 whitespace-nowrap" colSpan={4}>
                <Link
                  className="block"
                  href={buildSelectionHref("/admin/ai-config", current, { providerId: ALL_SELECTION, modelId: ALL_SELECTION })}
                >
                  全部 Provider
                </Link>
              </td>
            </tr>
            {providers.map((provider) => {
              const modelCount = models.filter((model) => model.providerId === provider.id).length;
              const isSelected = provider.id === selectedProviderId;

              return (
                <tr
                  key={provider.id}
                  className={`border-l-4 text-sm ${
                    isSelected ? "border-emerald-500 bg-emerald-100 font-semibold text-emerald-900" : "border-transparent hover:bg-slate-50"
                  }`}
                >
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    <Link
                      className="block"
                      href={buildSelectionHref("/admin/ai-config", current, { providerId: provider.id, modelId: ALL_SELECTION })}
                    >
                      {provider.providerLabel}
                    </Link>
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-xs text-slate-400">{modelCount}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    <StatusPill enabled={provider.isEnabled} status={provider.status} />
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-right">
                    <Link
                      className="text-xs font-medium text-slate-500 underline"
                      href={buildViewStateHref("/admin/ai-config", {
                        ...viewState,
                        providerId: selectedProviderId,
                        modelId: selectedModelId,
                        detailType: "provider",
                        detailId: provider.id
                      })}
                    >
                      编辑
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="border-t border-slate-200 px-2 py-2">
        <Link
          className="text-xs font-medium text-slate-600 underline"
          href={buildViewStateHref("/admin/ai-config", {
            ...viewState,
            providerId: selectedProviderId,
            modelId: selectedModelId,
            detailType: "provider",
            detailId: "new"
          })}
        >
          新增 Provider
        </Link>
      </div>
    </section>
  );
}
