import Link from "next/link";
import type { AdminAiOptionRecord, AdminModelRecord, AdminProviderRecord, AdminRuntimeTemplateRecord } from "../../../lib/admin-api-client";
import { ADMIN_AI_CONFIG_STATUS_OPTIONS } from "../../../lib/admin-ai-config-status";
import { buildViewStateHref, type AiConfigViewState } from "./ai-config-layout.helpers";
import { ACTUAL_REQUEST_PARAMETERS_GUIDE, JsonTextareaField, getStatusOptions } from "./shared-ui";

interface DetailPanelProps {
  detailType: string;
  detailId: string;
  viewState: AiConfigViewState;
  providers: AdminProviderRecord[];
  models: AdminModelRecord[];
  aiOptions: AdminAiOptionRecord[];
  runtimeTemplates: AdminRuntimeTemplateRecord[];
  createProviderAction: (formData: FormData) => Promise<void>;
  updateProviderAction: (formData: FormData) => Promise<void>;
  deleteProviderAction: (formData: FormData) => Promise<void>;
  createModelAction: (formData: FormData) => Promise<void>;
  updateModelAction: (formData: FormData) => Promise<void>;
  deleteModelAction: (formData: FormData) => Promise<void>;
  updateAiOptionAction: (formData: FormData) => Promise<void>;
  toggleAiOptionFlagAction: (formData: FormData) => Promise<void>;
  deleteAiOptionAction: (formData: FormData) => Promise<void>;
}

export function DetailPanel(props: DetailPanelProps) {
  const { detailType, detailId } = props;

  if (detailType === "provider") {
    return detailId === "new" ? <CreateProviderDetail {...props} /> : <EditProviderDetail {...props} />;
  }

  if (detailType === "model") {
    return detailId === "new" ? <CreateModelDetail {...props} /> : <EditModelDetail {...props} />;
  }

  if (detailType === "option") {
    return <EditOptionDetail {...props} />;
  }

  return null;
}

function PanelShell({ title, closeHref, children }: { title: string; closeHref: string; children: React.ReactNode }) {
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

function EditProviderDetail({ detailId, providers, models, viewState, updateProviderAction, deleteProviderAction }: DetailPanelProps) {
  const provider = providers.find((candidate) => candidate.id === detailId);
  if (!provider) {
    return null;
  }

  const modelCount = models.filter((model) => model.providerId === provider.id).length;
  const closeHref = buildViewStateHref("/admin/ai-config", { providerId: viewState.providerId, modelId: viewState.modelId });

  return (
    <PanelShell closeHref={closeHref} title={`编辑 Provider：${provider.providerLabel}`}>
      <div className="grid gap-4 md:grid-cols-2">
        <form action={updateProviderAction} className="grid gap-2">
          <input name="providerId" type="hidden" value={provider.id} />
          <label className="grid gap-1 text-xs text-slate-600">
            <span>显示名称</span>
            <input
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
              defaultValue={provider.displayName}
              name="displayName"
              required
            />
          </label>
          <label className="grid gap-1 text-xs text-slate-600">
            <span>Provider 标签</span>
            <input
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
              defaultValue={provider.providerLabel}
              name="providerLabel"
              required
            />
          </label>
          <label className="grid gap-1 text-xs text-slate-600">
            <span>Base URL（当前：{provider.baseUrlConfigured ? "已配置" : "缺失"}，留空表示不修改）</span>
            <input className="rounded-md border border-slate-300 px-2 py-1 text-sm" name="baseUrl" />
          </label>
          <label className="grid gap-1 text-xs text-slate-600">
            <span>API Key（当前：{provider.apiKeyPreview ?? "缺失"}，留空表示不修改）</span>
            <input className="rounded-md border border-slate-300 px-2 py-1 text-sm" name="apiKey" type="password" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-xs text-slate-600">
              <span>状态</span>
              <select className="rounded-md border border-slate-300 px-2 py-1 text-sm" defaultValue={provider.status} name="status">
                {getStatusOptions(provider.status).map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs text-slate-600">
              <span>健康</span>
              <select
                className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                defaultValue={provider.healthStatus}
                name="healthStatus"
              >
                {getStatusOptions(provider.healthStatus).map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="grid gap-1 text-xs text-slate-600">
            <span>禁用原因</span>
            <input
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
              defaultValue={provider.disableReason ?? ""}
              name="disableReason"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input defaultChecked={provider.isEnabled} name="isEnabled" type="checkbox" />
            启用
          </label>
          <button className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium" type="submit">
            保存
          </button>
        </form>
        <form action={deleteProviderAction} className="grid gap-2 self-start">
          <input name="providerId" type="hidden" value={provider.id} />
          {modelCount > 0 ? (
            <p className="text-xs text-slate-500">该 Provider 下还有 {modelCount} 个 Model，需先删除其下所有 Model 才能删除 Provider。</p>
          ) : (
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input name="confirmDelete" required type="checkbox" />
              确认删除
            </label>
          )}
          <button
            className="w-full rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-700 disabled:opacity-50"
            disabled={modelCount > 0}
            type="submit"
          >
            删除
          </button>
        </form>
      </div>
    </PanelShell>
  );
}

function CreateProviderDetail({ viewState, createProviderAction }: DetailPanelProps) {
  const closeHref = buildViewStateHref("/admin/ai-config", { providerId: viewState.providerId, modelId: viewState.modelId });

  return (
    <PanelShell closeHref={closeHref} title="新增 Provider">
      <form action={createProviderAction} className="grid gap-2 md:max-w-md">
        <label className="grid gap-1 text-xs text-slate-600">
          <span>显示名称</span>
          <input className="rounded-md border border-slate-300 px-2 py-1 text-sm" name="displayName" required />
        </label>
        <label className="grid gap-1 text-xs text-slate-600">
          <span>Provider 标签</span>
          <input className="rounded-md border border-slate-300 px-2 py-1 text-sm" name="providerLabel" required />
        </label>
        <label className="grid gap-1 text-xs text-slate-600">
          <span>Base URL</span>
          <input className="rounded-md border border-slate-300 px-2 py-1 text-sm" name="baseUrl" required />
        </label>
        <label className="grid gap-1 text-xs text-slate-600">
          <span>API Key</span>
          <input className="rounded-md border border-slate-300 px-2 py-1 text-sm" name="apiKey" type="password" />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1 text-xs text-slate-600">
            <span>状态</span>
            <select className="rounded-md border border-slate-300 px-2 py-1 text-sm" defaultValue="unknown" name="status">
              {ADMIN_AI_CONFIG_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-slate-600">
            <span>健康</span>
            <select className="rounded-md border border-slate-300 px-2 py-1 text-sm" defaultValue="unknown" name="healthStatus">
              {ADMIN_AI_CONFIG_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input name="isEnabled" type="checkbox" />
          启用
        </label>
        <button className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium" type="submit">
          新增
        </button>
      </form>
    </PanelShell>
  );
}

function EditModelDetail({ detailId, models, providers, aiOptions, runtimeTemplates, viewState, updateModelAction, deleteModelAction }: DetailPanelProps) {
  const model = models.find((candidate) => candidate.id === detailId);
  if (!model) {
    return null;
  }

  const provider = providers.find((candidate) => candidate.id === model.providerId);
  const optionCount = aiOptions.filter((option) => option.modelId === model.id).length;
  const closeHref = buildViewStateHref("/admin/ai-config", { providerId: viewState.providerId, modelId: viewState.modelId });

  return (
    <PanelShell closeHref={closeHref} title={`编辑 Model：${model.modelLabel}${provider ? ` / ${provider.providerLabel}` : ""}`}>
      <div className="grid gap-4 md:grid-cols-2">
        <form action={updateModelAction} className="grid gap-2">
          <input name="modelId" type="hidden" value={model.id} />
          <label className="grid gap-1 text-xs text-slate-600">
            <span>Model Key</span>
            <input
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
              defaultValue={model.modelKey}
              name="modelKey"
              required
            />
          </label>
          <label className="grid gap-1 text-xs text-slate-600">
            <span>显示名称</span>
            <input
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
              defaultValue={model.modelLabel}
              name="modelLabel"
              required
            />
          </label>
          <label className="grid gap-1 text-xs text-slate-600">
            <span>上游模型名</span>
            <input
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
              defaultValue={model.upstreamModel}
              name="upstreamModel"
              required
            />
          </label>
          <label className="grid gap-1 text-xs text-slate-600">
            <span>绑定运行参数模板</span>
            <select
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
              defaultValue={model.runtimeTemplateId ?? ""}
              name="runtimeTemplateId"
            >
              <option value="">暂不绑定</option>
              {runtimeTemplates.map((runtimeTemplate) => (
                <option key={runtimeTemplate.id} value={runtimeTemplate.id}>
                  {runtimeTemplate.name} ({runtimeTemplate.templateKey})
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-xs text-slate-600">
              <span>积分倍率</span>
              <input
                className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                defaultValue={model.baseCreditMultiplier}
                min="0"
                name="baseCreditMultiplier"
                step="0.01"
                type="number"
              />
            </label>
            <label className="grid gap-1 text-xs text-slate-600">
              <span>排序</span>
              <input
                className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                defaultValue={model.sortOrder}
                name="sortOrder"
                step="1"
                type="number"
              />
            </label>
          </div>
          <label className="grid gap-1 text-xs text-slate-600">
            <span>状态</span>
            <select className="rounded-md border border-slate-300 px-2 py-1 text-sm" defaultValue={model.status} name="status">
              {getStatusOptions(model.status).map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input defaultChecked={model.isEnabled} name="isEnabled" type="checkbox" />
            启用
          </label>
          <button className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium" type="submit">
            保存
          </button>
        </form>
        <form action={deleteModelAction} className="grid gap-2 self-start">
          <input name="modelId" type="hidden" value={model.id} />
          {optionCount > 0 ? (
            <p className="text-xs text-slate-500">该 Model 下还有 {optionCount} 个 AI Option，需先删除这些 AI Option 才能删除 Model。</p>
          ) : (
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input name="confirmDelete" required type="checkbox" />
              确认删除
            </label>
          )}
          <button
            className="w-full rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-700 disabled:opacity-50"
            disabled={optionCount > 0}
            type="submit"
          >
            删除
          </button>
        </form>
      </div>
    </PanelShell>
  );
}

function CreateModelDetail({ providers, runtimeTemplates, viewState, createModelAction }: DetailPanelProps) {
  const closeHref = buildViewStateHref("/admin/ai-config", { providerId: viewState.providerId, modelId: viewState.modelId });
  const defaultProviderId = viewState.providerId;

  return (
    <PanelShell closeHref={closeHref} title="新增 Model">
      <form action={createModelAction} className="grid gap-2 md:max-w-md">
        <label className="grid gap-1 text-xs text-slate-600">
          <span>所属 Provider</span>
          <select
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            defaultValue={defaultProviderId !== "all" ? defaultProviderId : providers[0]?.id}
            name="providerId"
            required
          >
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.providerLabel}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-slate-600">
          <span>Model Key</span>
          <input className="rounded-md border border-slate-300 px-2 py-1 text-sm" name="modelKey" required />
        </label>
        <label className="grid gap-1 text-xs text-slate-600">
          <span>绑定运行参数模板</span>
          <select className="rounded-md border border-slate-300 px-2 py-1 text-sm" defaultValue="" name="runtimeTemplateId">
            <option value="">暂不绑定</option>
            {runtimeTemplates.map((runtimeTemplate) => (
              <option key={runtimeTemplate.id} value={runtimeTemplate.id}>
                {runtimeTemplate.name} ({runtimeTemplate.templateKey})
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-slate-600">
          <span>显示名称</span>
          <input className="rounded-md border border-slate-300 px-2 py-1 text-sm" name="modelLabel" required />
        </label>
        <label className="grid gap-1 text-xs text-slate-600">
          <span>上游模型名</span>
          <input className="rounded-md border border-slate-300 px-2 py-1 text-sm" name="upstreamModel" required />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1 text-xs text-slate-600">
            <span>积分倍率</span>
            <input
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
              defaultValue={1}
              min="0"
              name="baseCreditMultiplier"
              step="0.01"
              type="number"
            />
          </label>
          <label className="grid gap-1 text-xs text-slate-600">
            <span>排序</span>
            <input
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
              defaultValue={0}
              name="sortOrder"
              step="1"
              type="number"
            />
          </label>
        </div>
        <label className="grid gap-1 text-xs text-slate-600">
          <span>状态</span>
          <select className="rounded-md border border-slate-300 px-2 py-1 text-sm" defaultValue="unknown" name="status">
            {ADMIN_AI_CONFIG_STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input name="isEnabled" type="checkbox" />
          启用
        </label>
        <button className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium" type="submit">
          新增
        </button>
      </form>
    </PanelShell>
  );
}

function EditOptionDetail({
  detailId,
  aiOptions,
  models,
  providers,
  viewState,
  updateAiOptionAction,
  toggleAiOptionFlagAction,
  deleteAiOptionAction
}: DetailPanelProps) {
  const option = aiOptions.find((candidate) => candidate.id === detailId);
  if (!option) {
    return null;
  }

  const model = models.find((candidate) => candidate.id === option.modelId);
  const provider = providers.find((candidate) => candidate.id === option.providerId);
  const closeHref = buildViewStateHref("/admin/ai-config", { providerId: viewState.providerId, modelId: viewState.modelId });

  return (
    <PanelShell
      closeHref={closeHref}
      title={`编辑 AI Option：${option.publicName}${model ? ` / ${model.modelLabel}` : ""}${provider ? ` / ${provider.providerLabel}` : ""}`}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <form action={updateAiOptionAction} className="grid gap-2">
          <input name="optionId" type="hidden" value={option.id} />
          <input name="modelId" type="hidden" value={option.modelId} />
          <input name="providerId" type="hidden" value={viewState.providerId} />
          <label className="grid gap-1 text-xs text-slate-600">
            <span>公开名称</span>
            <input
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
              defaultValue={option.publicName}
              name="publicName"
            />
          </label>
          <label className="grid gap-1 text-xs text-slate-600">
            <span>展示摘要</span>
            <textarea
              className="min-h-16 rounded-md border border-slate-300 px-2 py-1 text-sm"
              defaultValue={option.displayConfigSummary}
              name="displayConfigSummary"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input
              defaultChecked={option.displayConfigSummaryOverridden}
              name="displayConfigSummaryOverridden"
              type="checkbox"
            />
            覆盖展示摘要
          </label>
          <JsonTextareaField
            defaultValue={option.actualRequestParametersJson}
            guide={ACTUAL_REQUEST_PARAMETERS_GUIDE}
            helpText="这里保存的是服务器发送给 provider 的最终请求参数。"
            label="请求参数 JSON"
            name="actualRequestParametersJson"
          />
          <div className="grid grid-cols-3 gap-2 text-xs text-slate-600">
            <label className="flex items-center gap-1">
              <input defaultChecked={option.isRecommended} name="isRecommended" type="checkbox" />
              推荐
            </label>
            <label className="flex items-center gap-1">
              <input defaultChecked={option.isPublic} name="isPublic" type="checkbox" />
              公开
            </label>
            <label className="flex items-center gap-1">
              <input defaultChecked={option.isEnabled} name="isEnabled" type="checkbox" />
              启用
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
              defaultValue={option.creditMultiplier}
              min="0"
              name="creditMultiplier"
              step="0.01"
              type="number"
            />
            <input
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
              defaultValue={option.sortOrder}
              name="sortOrder"
              step="1"
              type="number"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-xs text-slate-600">
              <span>状态</span>
              <select
                className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                defaultValue={option.status}
                name="status"
              >
                {getStatusOptions(option.status).map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs text-slate-600">
              <span>健康</span>
              <select
                className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                defaultValue={option.healthStatus}
                name="healthStatus"
              >
                {getStatusOptions(option.healthStatus).map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="grid gap-1 text-xs text-slate-600">
            <span>禁用原因</span>
            <input
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
              defaultValue={option.disableReason ?? ""}
              name="disableReason"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input
              defaultChecked={option.creditMultiplierOverridden}
              name="creditMultiplierOverridden"
              type="checkbox"
            />
            覆盖积分倍率
          </label>
          <button className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium" type="submit">
            保存
          </button>
        </form>
        <div className="grid gap-2 self-start">
          <form action={toggleAiOptionFlagAction}>
            <input name="optionId" type="hidden" value={option.id} />
            <input name="providerId" type="hidden" value={viewState.providerId} />
            <input name="modelId" type="hidden" value={viewState.modelId} />
            <input name="flag" type="hidden" value="isEnabled" />
            <input name="nextValue" type="hidden" value={option.isEnabled ? "false" : "true"} />
            <button
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
              type="submit"
            >
              {option.isEnabled ? "停用" : "启用"}
            </button>
          </form>
          <form action={deleteAiOptionAction} className="grid gap-2">
            <input name="optionId" type="hidden" value={option.id} />
            <input name="providerId" type="hidden" value={viewState.providerId} />
            <input name="modelId" type="hidden" value={viewState.modelId} />
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input name="confirmDelete" required type="checkbox" />
              确认删除
            </label>
            <p className="text-xs text-slate-500">仅删除当前 AI Option；这条记录中的实际运行参数也会随之一起删除。</p>
            <button
              className="w-full rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-700"
              type="submit"
            >
              删除
            </button>
          </form>
        </div>
      </div>
    </PanelShell>
  );
}
