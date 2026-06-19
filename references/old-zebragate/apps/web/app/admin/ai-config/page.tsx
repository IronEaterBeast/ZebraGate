import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  applyAdminAiOptionGeneration,
  createAdminAiOption,
  createAdminModel,
  createAdminProvider,
  deleteAdminAiOption,
  deleteAdminModel,
  deleteAdminProvider,
  getAdminAiConfigCatalog,
  previewAdminAiOptionGeneration,
  updateAdminAiOption,
  updateAdminModel,
  updateAdminProvider
} from "../../../lib/admin-api-client";
import { assertAdminServerActionAuthenticated } from "../../../lib/admin-auth-server";
import {
  parseAdminAiOptionFormSubmission,
  parseCreateAdminAiOptionFormSubmission,
  parseCreateAdminModelFormSubmission,
  parseCreateAdminProviderFormSubmission,
  parseUpdateAdminModelFormSubmission,
  parseUpdateAdminProviderFormSubmission
} from "../../../lib/admin-ai-config-form";
import {
  countCustomerVisibleAiOptions,
  countCustomerVisibleRecommendedAiOptions
} from "../../../lib/admin-ai-config-visibility";
import { ALL_SELECTION } from "./ai-config-layout.helpers";
import { ProviderColumn } from "./ProviderColumn";
import { ModelColumn } from "./ModelColumn";
import { OptionColumn } from "./OptionColumn";
import { DetailPanel } from "./DetailPanel";
import { OptionActionOverlay } from "./OptionActionOverlay";

interface AdminAiConfigPageProps {
  searchParams?: Promise<{
    providerId?: string;
    modelId?: string;
    detailType?: string;
    detailId?: string;
    optionAction?: string;
    pc?: string;
    mc?: string;
    oc?: string;
    status?: string;
    message?: string;
  }>;
}

function buildResultRedirectPath(
  viewState: { providerId: string; modelId: string },
  status: "success" | "error",
  message: string
): string {
  const params = new URLSearchParams();
  if (viewState.providerId !== ALL_SELECTION) {
    params.set("providerId", viewState.providerId);
  }
  if (viewState.modelId !== ALL_SELECTION) {
    params.set("modelId", viewState.modelId);
  }
  params.set("status", status);
  params.set("message", message);
  return `/admin/ai-config?${params.toString()}`;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "操作失败";
}

export default async function AdminAiConfigPage({ searchParams }: AdminAiConfigPageProps) {
  const resolvedSearchParams = await searchParams;
  const catalog = await getAdminAiConfigCatalog();

  const selectedProviderId = resolvedSearchParams?.providerId ?? ALL_SELECTION;
  const selectedModelId = resolvedSearchParams?.modelId ?? ALL_SELECTION;
  const detailType = resolvedSearchParams?.detailType ?? "";
  const detailId = resolvedSearchParams?.detailId ?? "";
  const optionAction = resolvedSearchParams?.optionAction ?? "";
  const providerCollapsed = resolvedSearchParams?.pc === "1";
  const modelCollapsed = resolvedSearchParams?.mc === "1";
  const optionCollapsed = resolvedSearchParams?.oc === "1";
  const resultStatus = resolvedSearchParams?.status;
  const resultMessage = resolvedSearchParams?.message;
  const customerVisibleOptionCount = countCustomerVisibleAiOptions(catalog);
  const customerVisibleRecommendedOptionCount = countCustomerVisibleRecommendedAiOptions(catalog);

  const viewState = {
    providerId: selectedProviderId,
    modelId: selectedModelId,
    providerCollapsed,
    modelCollapsed,
    optionCollapsed
  };
  const gridTemplateColumns = `${providerCollapsed ? "auto" : "minmax(0,5fr)"} ${
    modelCollapsed ? "auto" : "minmax(0,5fr)"
  } ${optionCollapsed ? "auto" : "minmax(0,10fr)"}`;

  const selectedModel =
    selectedModelId !== ALL_SELECTION ? catalog.models.find((model) => model.id === selectedModelId) ?? null : null;
  const selectedRuntimeTemplate = selectedModel
    ? catalog.runtimeTemplates.find((runtimeTemplate) => runtimeTemplate.id === selectedModel.runtimeTemplateId) ?? null
    : null;
  const preview =
    optionAction === "generate" && selectedRuntimeTemplate
      ? await previewAdminAiOptionGeneration(selectedRuntimeTemplate.id)
      : [];

  return (
    <main className="space-y-6">
      {resultStatus && resultMessage ? (
        <div
          className={
            resultStatus === "success"
              ? "rounded-md border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm text-emerald-800"
              : "rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800"
          }
        >
          {resultMessage}
        </div>
      ) : null}
      {customerVisibleOptionCount === 0 ? (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          当前没有任何用户可见、可选择的 AI Option，客户端将无法选择任何 AI，业务不可用。请检查 Provider / Model / AI
          Option 的启用状态，以及 AI Option 的"公开"标记。
        </div>
      ) : null}
      {customerVisibleOptionCount > 0 && customerVisibleRecommendedOptionCount === 0 ? (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          当前没有任何用户可见、可选择且标记为推荐的 AI Option，desktop 新建分组将不会默认选中任何 AI。请至少将一个用户可见、可选择的
          AI Option 标记为推荐。
        </div>
      ) : null}
      <section className="border-b border-slate-200 pb-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">AI Configuration</h1>
            <p className="mt-1 text-sm text-slate-500">
              {catalog.providers.length} providers · {catalog.models.length} models · {catalog.aiOptions.length} options
            </p>
            <p className="mt-1 text-sm text-slate-500">
              客户端实际可见可选：
              <span className={customerVisibleOptionCount === 0 ? "font-semibold text-red-700" : "font-semibold text-emerald-700"}>
                {" "}
                {customerVisibleOptionCount} 个 option
              </span>
              （需 Option 本身公开且启用、所属 Model 启用、所属 Provider 启用，且三者状态均不为 disabled）
            </p>
          </div>
          <Link className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium" href="/admin/ai-config/runtime-templates">
            运行参数模板管理
          </Link>
        </div>
      </section>

      <section
        className="grid grid-cols-1 divide-x divide-slate-200 rounded-lg border border-slate-200 bg-white xl:grid-cols-[var(--cols)]"
        style={{ "--cols": gridTemplateColumns } as Record<string, string>}
      >
        <ProviderColumn
          collapsed={providerCollapsed}
          models={catalog.models}
          providers={catalog.providers}
          selectedModelId={selectedModelId}
          selectedProviderId={selectedProviderId}
          viewState={viewState}
        />
        <ModelColumn
          aiOptions={catalog.aiOptions}
          collapsed={modelCollapsed}
          models={catalog.models}
          runtimeTemplates={catalog.runtimeTemplates}
          selectedModelId={selectedModelId}
          selectedProviderId={selectedProviderId}
          viewState={viewState}
        />
        <OptionColumn
          aiOptions={catalog.aiOptions}
          collapsed={optionCollapsed}
          models={catalog.models}
          providers={catalog.providers}
          selectedModelId={selectedModelId}
          selectedProviderId={selectedProviderId}
          toggleAiOptionFlagAction={toggleAiOptionFlagAction}
          viewState={viewState}
        />
      </section>

      {detailType ? (
        <DetailPanel
          aiOptions={catalog.aiOptions}
          createModelAction={createModelAction}
          createProviderAction={createProviderAction}
          deleteAiOptionAction={deleteAiOptionAction}
          deleteModelAction={deleteModelAction}
          deleteProviderAction={deleteProviderAction}
          detailId={detailId}
          detailType={detailType}
          models={catalog.models}
          providers={catalog.providers}
          runtimeTemplates={catalog.runtimeTemplates}
          toggleAiOptionFlagAction={toggleAiOptionFlagAction}
          updateAiOptionAction={updateAiOptionAction}
          updateModelAction={updateModelAction}
          updateProviderAction={updateProviderAction}
          viewState={viewState}
        />
      ) : null}

      {optionAction ? (
        <OptionActionOverlay
          aiOptions={catalog.aiOptions}
          applyGenerationAction={applyGenerationAction}
          applyGenerationItemAction={applyGenerationItemAction}
          createAiOptionAction={createAiOptionAction}
          models={catalog.models}
          optionAction={optionAction}
          preview={preview}
          providers={catalog.providers}
          runtimeTemplates={catalog.runtimeTemplates}
          viewState={viewState}
        />
      ) : null}
    </main>
  );
}

async function updateAiOptionAction(formData: FormData) {
  "use server";

  await assertAdminServerActionAuthenticated();

  const { optionId, input } = parseAdminAiOptionFormSubmission(formData);
  const viewState = readViewState(formData);
  if (!optionId) {
    return;
  }

  try {
    await updateAdminAiOption(optionId, input);
  } catch (error) {
    redirect(buildResultRedirectPath(viewState, "error", toErrorMessage(error)));
  }

  revalidatePath("/admin/ai-config");
  redirect(buildResultRedirectPath(viewState, "success", "AI Option 已更新"));
}

async function createAiOptionAction(formData: FormData) {
  "use server";

  await assertAdminServerActionAuthenticated();

  const { input } = parseCreateAdminAiOptionFormSubmission(formData);
  const viewState = readViewState(formData);
  if (!input) {
    return;
  }

  try {
    await createAdminAiOption(input);
  } catch (error) {
    redirect(buildResultRedirectPath(viewState, "error", toErrorMessage(error)));
  }

  revalidatePath("/admin/ai-config");
  redirect(buildResultRedirectPath(viewState, "success", "AI Option 已新增"));
}

const AI_OPTION_FLAG_FIELDS: Record<string, "isRecommended" | "isPublic" | "isEnabled"> = {
  isRecommended: "isRecommended",
  isPublic: "isPublic",
  isEnabled: "isEnabled"
};

async function toggleAiOptionFlagAction(formData: FormData) {
  "use server";

  await assertAdminServerActionAuthenticated();

  const optionId = String(formData.get("optionId") ?? "");
  const flag = String(formData.get("flag") ?? "");
  const nextValue = String(formData.get("nextValue") ?? "") === "true";
  const field = AI_OPTION_FLAG_FIELDS[flag];
  if (!optionId || !field) {
    return;
  }

  await updateAdminAiOption(optionId, {
    [field]: nextValue
  });

  revalidatePath("/admin/ai-config");
}

async function deleteAiOptionAction(formData: FormData) {
  "use server";

  await assertAdminServerActionAuthenticated();

  const optionId = String(formData.get("optionId") ?? "");
  const confirmDelete = formData.has("confirmDelete");
  const viewState = readViewState(formData);
  if (!optionId || !confirmDelete) {
    return;
  }

  try {
    await deleteAdminAiOption(optionId);
  } catch (error) {
    redirect(buildResultRedirectPath(viewState, "error", toErrorMessage(error)));
  }

  revalidatePath("/admin/ai-config");
  redirect(buildResultRedirectPath(viewState, "success", "AI Option 已删除"));
}

async function applyGenerationAction(formData: FormData) {
  "use server";

  await assertAdminServerActionAuthenticated();

  const runtimeTemplateId = String(formData.get("runtimeTemplateId") ?? "");
  const viewState = readViewState(formData);
  if (!runtimeTemplateId) {
    return;
  }

  try {
    await applyAdminAiOptionGeneration(runtimeTemplateId);
  } catch (error) {
    redirect(buildResultRedirectPath(viewState, "error", toErrorMessage(error)));
  }

  revalidatePath("/admin/ai-config");
  redirect(buildResultRedirectPath(viewState, "success", "已应用全部 AI Option 建议"));
}

async function applyGenerationItemAction(formData: FormData) {
  "use server";

  await assertAdminServerActionAuthenticated();

  const runtimeTemplateId = String(formData.get("runtimeTemplateId") ?? "");
  const normalizedParameterValuesJson = String(formData.get("normalizedParameterValuesJson") ?? "");
  const viewState = readViewState(formData);
  if (!runtimeTemplateId || !normalizedParameterValuesJson) {
    return;
  }

  const targetNormalizedParameterValues = JSON.parse(normalizedParameterValuesJson) as Record<string, string>;
  try {
    await applyAdminAiOptionGeneration(runtimeTemplateId, targetNormalizedParameterValues);
  } catch (error) {
    redirect(buildResultRedirectPath(viewState, "error", toErrorMessage(error)));
  }

  revalidatePath("/admin/ai-config");
  redirect(buildResultRedirectPath(viewState, "success", "已应用该 AI Option 建议"));
}

async function createProviderAction(formData: FormData) {
  "use server";

  await assertAdminServerActionAuthenticated();

  const { input } = parseCreateAdminProviderFormSubmission(formData);
  const viewState = readViewState(formData);
  if (!input) {
    return;
  }

  try {
    await createAdminProvider(input);
  } catch (error) {
    redirect(buildResultRedirectPath(viewState, "error", toErrorMessage(error)));
  }

  revalidatePath("/admin/ai-config");
  redirect(buildResultRedirectPath(viewState, "success", "Provider 已新增"));
}

async function updateProviderAction(formData: FormData) {
  "use server";

  await assertAdminServerActionAuthenticated();

  const { providerId, input } = parseUpdateAdminProviderFormSubmission(formData);
  const viewState = readViewState(formData);
  if (!providerId) {
    return;
  }

  try {
    await updateAdminProvider(providerId, input);
  } catch (error) {
    redirect(buildResultRedirectPath(viewState, "error", toErrorMessage(error)));
  }

  revalidatePath("/admin/ai-config");
  redirect(buildResultRedirectPath(viewState, "success", "Provider 已更新"));
}

async function deleteProviderAction(formData: FormData) {
  "use server";

  await assertAdminServerActionAuthenticated();

  const providerId = String(formData.get("providerId") ?? "");
  const confirmDelete = formData.has("confirmDelete");
  const viewState = readViewState(formData);
  if (!providerId || !confirmDelete) {
    return;
  }

  try {
    await deleteAdminProvider(providerId);
  } catch (error) {
    redirect(buildResultRedirectPath(viewState, "error", toErrorMessage(error)));
  }

  revalidatePath("/admin/ai-config");
  redirect(buildResultRedirectPath({ providerId: ALL_SELECTION, modelId: ALL_SELECTION }, "success", "Provider 已删除"));
}

async function createModelAction(formData: FormData) {
  "use server";

  await assertAdminServerActionAuthenticated();

  const { input } = parseCreateAdminModelFormSubmission(formData);
  const viewState = readViewState(formData);
  if (!input) {
    return;
  }

  try {
    await createAdminModel(input);
  } catch (error) {
    redirect(buildResultRedirectPath(viewState, "error", toErrorMessage(error)));
  }

  revalidatePath("/admin/ai-config");
  redirect(buildResultRedirectPath(viewState, "success", "模型已新增"));
}

async function updateModelAction(formData: FormData) {
  "use server";

  await assertAdminServerActionAuthenticated();

  const { modelId, input } = parseUpdateAdminModelFormSubmission(formData);
  const viewState = readViewState(formData);
  if (!modelId) {
    return;
  }

  try {
    await updateAdminModel(modelId, input);
  } catch (error) {
    redirect(buildResultRedirectPath(viewState, "error", toErrorMessage(error)));
  }

  revalidatePath("/admin/ai-config");
  redirect(buildResultRedirectPath(viewState, "success", "模型已更新"));
}

async function deleteModelAction(formData: FormData) {
  "use server";

  await assertAdminServerActionAuthenticated();

  const modelId = String(formData.get("modelId") ?? "");
  const confirmDelete = formData.has("confirmDelete");
  const viewState = readViewState(formData);
  if (!modelId || !confirmDelete) {
    return;
  }

  try {
    await deleteAdminModel(modelId);
  } catch (error) {
    redirect(buildResultRedirectPath(viewState, "error", toErrorMessage(error)));
  }

  revalidatePath("/admin/ai-config");
  redirect(
    buildResultRedirectPath({ providerId: viewState.providerId, modelId: ALL_SELECTION }, "success", "模型已删除")
  );
}

function readViewState(formData: FormData): { providerId: string; modelId: string } {
  return {
    providerId: String(formData.get("providerId") ?? "") || ALL_SELECTION,
    modelId: String(formData.get("modelId") ?? "") || ALL_SELECTION
  };
}
