import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  deleteAdminRuntimeTemplate,
  getAdminAiConfigCatalog,
  updateAdminRuntimeTemplate,
  type AdminModelRecord,
  type AdminRuntimeTemplateRecord
} from "../../../../lib/admin-api-client";
import { assertAdminServerActionAuthenticated } from "../../../../lib/admin-auth-server";
import { parseUpdateAdminRuntimeTemplateFormSubmission } from "../../../../lib/admin-ai-config-form";
import { CreateRuntimeTemplateForm } from "./CreateRuntimeTemplateForm";
import { RuntimeTemplateUpdateForm } from "./RuntimeTemplateUpdateForm";

interface RuntimeTemplatesPageProps {
  searchParams?: Promise<{
    status?: string;
    message?: string;
  }>;
}

function buildResultRedirectPath(status: "success" | "error", message: string): string {
  const params = new URLSearchParams();
  params.set("status", status);
  params.set("message", message);
  return `/admin/ai-config/runtime-templates?${params.toString()}`;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "操作失败";
}

export default async function AdminRuntimeTemplatesPage({ searchParams }: RuntimeTemplatesPageProps) {
  const resolvedSearchParams = await searchParams;
  const catalog = await getAdminAiConfigCatalog();
  const resultStatus = resolvedSearchParams?.status;
  const resultMessage = resolvedSearchParams?.message;

  return (
    <main className="space-y-6">
      <section className="border-b border-slate-200 pb-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">运行参数模板</h1>
            <p className="mt-1 text-sm text-slate-500">{catalog.runtimeTemplates.length} 个模板</p>
          </div>
          <Link className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium" href="/admin/ai-config">
            返回 AI Configuration
          </Link>
        </div>
      </section>
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
      <ExistingRuntimeTemplatesPanel models={catalog.models} runtimeTemplates={catalog.runtimeTemplates} />
      <CreateRuntimeTemplatePanel />
    </main>
  );
}

function ExistingRuntimeTemplatesPanel({
  models,
  runtimeTemplates
}: {
  models: AdminModelRecord[];
  runtimeTemplates: AdminRuntimeTemplateRecord[];
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-700">已有运行参数模板</h2>
      </div>
      <div className="divide-y divide-slate-100">
        {runtimeTemplates.length === 0 ? (
          <p className="px-4 py-3 text-sm text-slate-500">还没有运行参数模板。先在下方新增，再让 Model 绑定它。</p>
        ) : (
          runtimeTemplates.map((runtimeTemplate) => {
            const boundModels = models.filter((model) => model.runtimeTemplateId === runtimeTemplate.id);

            return (
              <details key={runtimeTemplate.id} className="group px-4 py-2 text-sm">
                <summary className="flex cursor-pointer list-none items-center gap-3">
                  <div className="flex min-w-0 flex-1 items-baseline gap-2 overflow-hidden">
                    <span className="shrink-0 font-medium">{runtimeTemplate.name}</span>
                    <span className="shrink-0 text-xs text-slate-500">{runtimeTemplate.templateKey}</span>
                    {runtimeTemplate.description ? (
                      <span className="truncate text-xs text-slate-400">{runtimeTemplate.description}</span>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-xs text-slate-500">{boundModels.length} 个 Model 已绑定</span>
                  <span className="shrink-0 text-xs font-medium text-slate-600 group-open:hidden">编辑</span>
                  <span className="hidden shrink-0 text-xs font-medium text-slate-600 group-open:inline">收起</span>
                </summary>
                <div className="mt-3 rounded-md border border-slate-200 px-3 py-2">
                  <RuntimeTemplateUpdateForm action={updateRuntimeTemplateAction} runtimeTemplate={runtimeTemplate} />
                  <form action={deleteRuntimeTemplateAction} className="mt-3 grid gap-2">
                    <input name="runtimeTemplateId" type="hidden" value={runtimeTemplate.id} />
                    {boundModels.length > 0 ? (
                      <p className="text-xs text-slate-500">
                        该模板还有 {boundModels.length} 个 Model 在使用，需先解除绑定后才能删除。
                      </p>
                    ) : (
                      <label className="flex items-center gap-2 text-xs text-slate-600">
                        <input name="confirmDelete" required type="checkbox" />
                        确认删除
                      </label>
                    )}
                    <button
                      className="w-full rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-700 disabled:opacity-50"
                      disabled={boundModels.length > 0}
                      type="submit"
                    >
                      删除
                    </button>
                  </form>
                </div>
              </details>
            );
          })
        )}
      </div>
    </section>
  );
}

function CreateRuntimeTemplatePanel() {
  return (
    <section className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <h2 className="text-sm font-semibold text-slate-700">新增运行参数模板</h2>
      <CreateRuntimeTemplateForm />
    </section>
  );
}

async function updateRuntimeTemplateAction(formData: FormData) {
  "use server";

  await assertAdminServerActionAuthenticated();

  const { runtimeTemplateId, input } = parseUpdateAdminRuntimeTemplateFormSubmission(formData);
  if (!runtimeTemplateId) {
    return;
  }

  try {
    await updateAdminRuntimeTemplate(runtimeTemplateId, input);
  } catch (error) {
    redirect(buildResultRedirectPath("error", toErrorMessage(error)));
  }

  revalidatePath("/admin/ai-config/runtime-templates");
  redirect(buildResultRedirectPath("success", "运行时模板已更新"));
}

async function deleteRuntimeTemplateAction(formData: FormData) {
  "use server";

  await assertAdminServerActionAuthenticated();

  const runtimeTemplateId = String(formData.get("runtimeTemplateId") ?? "");
  const confirmDelete = formData.has("confirmDelete");
  if (!runtimeTemplateId || !confirmDelete) {
    return;
  }

  try {
    await deleteAdminRuntimeTemplate(runtimeTemplateId);
  } catch (error) {
    redirect(buildResultRedirectPath("error", toErrorMessage(error)));
  }

  revalidatePath("/admin/ai-config/runtime-templates");
  redirect(buildResultRedirectPath("success", "运行时模板已删除"));
}
