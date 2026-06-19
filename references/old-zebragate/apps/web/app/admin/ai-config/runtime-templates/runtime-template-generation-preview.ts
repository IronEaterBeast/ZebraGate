import {
  applyTemplateCreditRules,
  applyTemplateRequestDefaults,
  buildTemplateGenerationInputFromSchema,
  generateAiOptionVariantPreview,
  isPlainObject,
  type JsonObject
} from "@zebragate/shared";

export interface GenerationPreviewItem {
  normalizedParameterValues: Record<string, string>;
  requestParameters: JsonObject;
  hasRequestParameterConflict: boolean;
  conflictDetails: string[];
  generatedConfigSummary: string;
  generatedCreditMultiplier: number;
}

export interface GenerationPreviewWarning {
  type: "empty_dimension";
  message: string;
}

export interface GenerationPreviewResult {
  items: GenerationPreviewItem[];
  warnings: GenerationPreviewWarning[];
}

const PLACEHOLDER_MODEL = {
  id: "preview",
  providerId: "preview",
  modelLabel: "",
  baseCreditMultiplier: 0
};

/**
 * Model-independent preview of the AI Option suggestions a runtime template
 * would generate, reusing the same combination/summary/credit logic as the
 * "批量生成 AI Option 建议" feature (@zebragate/shared/ai-option-generator).
 */
export function buildGenerationPreview(schemaJsonText: string): GenerationPreviewResult {
  const schema = parseSchema(schemaJsonText);
  if (!schema) {
    return { items: [], warnings: [] };
  }

  const warnings = collectSchemaWarnings(schema);

  const templateGeneration = buildTemplateGenerationInputFromSchema(schema);
  if (!templateGeneration) {
    return { items: [], warnings };
  }

  const preview = generateAiOptionVariantPreview({
    model: PLACEHOLDER_MODEL,
    dimensions: templateGeneration.dimensions
  });

  const items = preview.map((item) => {
    const withDefaults = applyTemplateRequestDefaults(item, templateGeneration.requestDefaults);
    const withCredit = applyTemplateCreditRules(
      withDefaults,
      PLACEHOLDER_MODEL.baseCreditMultiplier,
      templateGeneration.creditBaseMultiplier ?? 1,
      templateGeneration.creditCombinationRules
    );

    return {
      normalizedParameterValues: withCredit.normalizedParameterValues,
      requestParameters: withCredit.requestParameters,
      hasRequestParameterConflict: withCredit.hasRequestParameterConflict,
      conflictDetails: withCredit.conflictDetails,
      generatedConfigSummary: withCredit.generatedConfigSummary,
      generatedCreditMultiplier: withCredit.generatedCreditMultiplier
    };
  });

  return { items, warnings };
}

function parseSchema(schemaJsonText: string): JsonObject | null {
  try {
    const parsed = JSON.parse(schemaJsonText) as unknown;
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function collectSchemaWarnings(schema: JsonObject): GenerationPreviewWarning[] {
  const parameters = isPlainObject(schema.parameters) ? schema.parameters : {};
  const warnings: GenerationPreviewWarning[] = [];

  for (const [parameterKey, parameterDefinition] of Object.entries(parameters)) {
    const definition = isPlainObject(parameterDefinition) ? parameterDefinition : {};
    const options = Array.isArray(definition.options) ? definition.options : [];
    const hasValidOption = options.some((option) => {
      const optionRecord = isPlainObject(option) ? option : {};
      return typeof optionRecord.internalKey === "string" && optionRecord.internalKey.trim().length > 0;
    });

    if (!hasValidOption) {
      warnings.push({
        type: "empty_dimension",
        message: `参数维度「${parameterKey}」没有任何有效候选值（internalKey 缺失或为空），将被忽略。`
      });
    }
  }

  return warnings;
}
