import { afterEach, describe, expect, it, vi } from "vitest";

const { assertAdminServerActionAuthenticatedMock, createAdminRuntimeTemplateMock, revalidatePathMock } = vi.hoisted(() => ({
  assertAdminServerActionAuthenticatedMock: vi.fn(async () => {}),
  createAdminRuntimeTemplateMock: vi.fn(async () => {}),
  revalidatePathMock: vi.fn()
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock
}));

vi.mock("../../../../lib/admin-api-client", () => ({
  createAdminRuntimeTemplate: createAdminRuntimeTemplateMock
}));

vi.mock("../../../../lib/admin-auth-server", () => ({
  assertAdminServerActionAuthenticated: assertAdminServerActionAuthenticatedMock
}));

import { createRuntimeTemplateFormAction, type CreateRuntimeTemplateFormState } from "./runtime-template-actions";

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

function buildFormData(overrides: Record<string, string | undefined>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) {
      formData.set(key, value);
    }
  }
  return formData;
}

describe("createRuntimeTemplateFormAction", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns field-specific errors and preserves submitted values when validation fails", async () => {
    const formData = buildFormData({
      templateKey: "",
      name: "",
      description: "说明文字",
      parameterSchemaJson: "{ invalid json",
      adminNote: "备注"
    });

    const result = await createRuntimeTemplateFormAction(INITIAL_STATE, formData);

    expect(result.errors).toEqual([
      "模板 Key 为必填项。",
      "模板名称为必填项。",
      "参数结构 JSON 不是合法的 JSON，请检查格式（如多余的逗号、未闭合的括号或引号）。"
    ]);
    expect(result.values).toEqual({
      templateKey: "",
      name: "",
      description: "说明文字",
      parameterSchemaJson: "{ invalid json",
      adminNote: "备注",
      isEnabled: false
    });
    expect(createAdminRuntimeTemplateMock).not.toHaveBeenCalled();
  });

  it("returns the API error message and preserves values when creation fails", async () => {
    createAdminRuntimeTemplateMock.mockRejectedValueOnce(new Error("模板 Key 已存在"));

    const formData = buildFormData({
      templateKey: "template-key",
      name: "模板名称",
      parameterSchemaJson: "{}"
    });

    const result = await createRuntimeTemplateFormAction(INITIAL_STATE, formData);

    expect(result.errors).toEqual(["模板 Key 已存在"]);
    expect(result.values.templateKey).toBe("template-key");
    expect(result.values.name).toBe("模板名称");
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("clears the form and revalidates the page on success", async () => {
    const formData = buildFormData({
      templateKey: "template-key",
      name: "模板名称",
      parameterSchemaJson: "{}"
    });

    const result = await createRuntimeTemplateFormAction(INITIAL_STATE, formData);

    expect(result.errors).toEqual([]);
    expect(result.values).toEqual({
      templateKey: "",
      name: "",
      description: "",
      parameterSchemaJson: "",
      adminNote: "",
      isEnabled: false
    });
    expect(createAdminRuntimeTemplateMock).toHaveBeenCalledWith({
      templateKey: "template-key",
      name: "模板名称",
      description: null,
      parameterSchemaJson: {},
      isEnabled: false,
      adminNote: null
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/ai-config");
  });
});
