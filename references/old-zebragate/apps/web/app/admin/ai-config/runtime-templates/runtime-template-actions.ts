"use server";

import { revalidatePath } from "next/cache";
import { createAdminRuntimeTemplate } from "../../../../lib/admin-api-client";
import { assertAdminServerActionAuthenticated } from "../../../../lib/admin-auth-server";
import { parseCreateAdminRuntimeTemplateFormSubmission } from "../../../../lib/admin-ai-config-form";

export interface CreateRuntimeTemplateFormValues {
  templateKey: string;
  name: string;
  description: string;
  parameterSchemaJson: string;
  adminNote: string;
  isEnabled: boolean;
}

export interface CreateRuntimeTemplateFormState {
  errors: string[];
  values: CreateRuntimeTemplateFormValues;
}

function readFormValues(formData: FormData): CreateRuntimeTemplateFormValues {
  return {
    templateKey: String(formData.get("templateKey") ?? ""),
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    parameterSchemaJson: String(formData.get("parameterSchemaJson") ?? ""),
    adminNote: String(formData.get("adminNote") ?? ""),
    isEnabled: formData.has("isEnabled")
  };
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "操作失败";
}

export async function createRuntimeTemplateFormAction(
  _previousState: CreateRuntimeTemplateFormState,
  formData: FormData
): Promise<CreateRuntimeTemplateFormState> {
  await assertAdminServerActionAuthenticated();

  const values = readFormValues(formData);
  const { input, errors } = parseCreateAdminRuntimeTemplateFormSubmission(formData);

  if (!input) {
    return { errors, values };
  }

  try {
    await createAdminRuntimeTemplate(input);
  } catch (error) {
    return { errors: [toErrorMessage(error)], values };
  }

  revalidatePath("/admin/ai-config");
  return {
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
}
