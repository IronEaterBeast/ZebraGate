import { describe, expect, it } from "vitest";
import { parseCreateAdminRuntimeTemplateFormSubmission } from "./admin-ai-config-form";

describe("parseCreateAdminRuntimeTemplateFormSubmission", () => {
  it("parses a valid submission into a create input", () => {
    const formData = new FormData();
    formData.set("templateKey", "template-key");
    formData.set("name", "模板名称");
    formData.set("description", "说明文字");
    formData.set("parameterSchemaJson", JSON.stringify({ parameters: {} }));
    formData.set("adminNote", "备注");
    formData.set("isEnabled", "on");

    const { input } = parseCreateAdminRuntimeTemplateFormSubmission(formData);

    expect(input).toEqual({
      templateKey: "template-key",
      name: "模板名称",
      description: "说明文字",
      parameterSchemaJson: { parameters: {} },
      isEnabled: true,
      adminNote: "备注"
    });
  });

  it("treats an empty parameter schema field as an empty object", () => {
    const formData = new FormData();
    formData.set("templateKey", "template-key");
    formData.set("name", "模板名称");
    formData.set("parameterSchemaJson", "");

    const { input } = parseCreateAdminRuntimeTemplateFormSubmission(formData);

    expect(input?.parameterSchemaJson).toEqual({});
  });

  it("returns null input and a JSON error when the parameter schema is not valid JSON", () => {
    const formData = new FormData();
    formData.set("templateKey", "template-key");
    formData.set("name", "模板名称");
    formData.set("parameterSchemaJson", "{ invalid json");

    const { input, errors } = parseCreateAdminRuntimeTemplateFormSubmission(formData);

    expect(input).toBeNull();
    expect(errors).toEqual(["参数结构 JSON 不是合法的 JSON，请检查格式（如多余的逗号、未闭合的括号或引号）。"]);
  });

  it("returns null input and a field error when templateKey is missing", () => {
    const formData = new FormData();
    formData.set("templateKey", "");
    formData.set("name", "模板名称");
    formData.set("parameterSchemaJson", "{}");

    const { input, errors } = parseCreateAdminRuntimeTemplateFormSubmission(formData);

    expect(input).toBeNull();
    expect(errors).toEqual(["模板 Key 为必填项。"]);
  });

  it("returns null input and a field error when name is missing", () => {
    const formData = new FormData();
    formData.set("templateKey", "template-key");
    formData.set("name", "");
    formData.set("parameterSchemaJson", "{}");

    const { input, errors } = parseCreateAdminRuntimeTemplateFormSubmission(formData);

    expect(input).toBeNull();
    expect(errors).toEqual(["模板名称为必填项。"]);
  });

  it("returns all applicable field errors when multiple fields are invalid", () => {
    const formData = new FormData();
    formData.set("templateKey", "");
    formData.set("name", "");
    formData.set("parameterSchemaJson", "{ invalid json");

    const { input, errors } = parseCreateAdminRuntimeTemplateFormSubmission(formData);

    expect(input).toBeNull();
    expect(errors).toEqual([
      "模板 Key 为必填项。",
      "模板名称为必填项。",
      "参数结构 JSON 不是合法的 JSON，请检查格式（如多余的逗号、未闭合的括号或引号）。"
    ]);
  });
});
