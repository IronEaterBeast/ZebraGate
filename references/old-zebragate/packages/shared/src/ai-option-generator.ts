export type JsonObject = Record<string, unknown>;

export interface AiOptionGenerationModel {
  id: string;
  providerId: string;
  modelLabel: string;
  baseCreditMultiplier: number;
}

export interface AiOptionGenerationDimension {
  key: string;
  label: string;
  values: AiOptionGenerationValue[];
}

export interface AiOptionGenerationValue {
  key: string;
  summary?: string;
  creditMultiplierDelta?: number;
  requestParameterFragment?: JsonObject;
  dependsOn?: Record<string, string>;
}

export interface ExistingGeneratedAiOption {
  id: string;
  modelId: string;
  requestParameters: JsonObject;
  publicName: string;
  generatedConfigSummary: string;
  displayConfigSummary: string;
  displayConfigSummaryOverridden: boolean;
  generatedCreditMultiplier: number;
  creditMultiplier: number;
  creditMultiplierOverridden: boolean;
}

export type AiOptionGenerationAction = "create" | "exists" | "update" | "conflict";

export interface AiOptionGenerationPreviewItem {
  action: AiOptionGenerationAction;
  modelId: string;
  providerId: string;
  publicName: string;
  parameterValues: Record<string, string>;
  normalizedParameterValues: Record<string, string>;
  requestParameters: JsonObject;
  hasRequestParameterConflict: boolean;
  conflictDetails: string[];
  generatedConfigSummary: string;
  displayConfigSummary: string;
  displayConfigSummaryOverridden: boolean;
  generatedCreditMultiplier: number;
  creditMultiplier: number;
  creditMultiplierOverridden: boolean;
  existingRuntimePresetId?: string;
  existingAiOptionId?: string;
}

export interface GenerateAiOptionVariantPreviewInput {
  model: AiOptionGenerationModel;
  dimensions: AiOptionGenerationDimension[];
  existingAiOptions?: ExistingGeneratedAiOption[];
}

export function generateAiOptionVariantPreview(
  input: GenerateAiOptionVariantPreviewInput
): AiOptionGenerationPreviewItem[] {
  const dimensions = input.dimensions.map((dimension) => ({
    ...dimension,
    values: dimension.values.filter((value) => value.key.trim().length > 0)
  }));
  const combinations = buildLegalCombinations(dimensions);
  const existingOptionByRequestIdentity = new Map(
    (input.existingAiOptions ?? [])
      .filter((option) => option.modelId === input.model.id)
      .map((option) => [createRequestIdentity(option.requestParameters), option])
  );

  return combinations.map((combination) => {
    const normalizedParameterValues = normalizeParameterValues(combination.parameterValues);
    const mergeResult = mergeRequestParameterFragments(combination.values);
    const existingOption = mergeResult.conflicts.length > 0
      ? undefined
      : existingOptionByRequestIdentity.get(createRequestIdentity(mergeResult.value));
    const generatedConfigSummary = buildConfigSummary(combination.values);
    const generatedCreditMultiplier = roundCreditMultiplier(
      input.model.baseCreditMultiplier +
        combination.values.reduce((total, value) => total + (value.creditMultiplierDelta ?? 0), 0)
    );
    const displayConfigSummary = existingOption?.displayConfigSummaryOverridden
      ? existingOption.displayConfigSummary
      : generatedConfigSummary;
    const creditMultiplier = existingOption?.creditMultiplierOverridden
      ? existingOption.creditMultiplier
      : generatedCreditMultiplier;
    const hasGeneratedChanges = existingOption
      ? existingOption.publicName !== buildPublicName(input.model.modelLabel, generatedConfigSummary) ||
        existingOption.generatedConfigSummary !== generatedConfigSummary ||
        existingOption.generatedCreditMultiplier !== generatedCreditMultiplier ||
        (!existingOption.displayConfigSummaryOverridden &&
          existingOption.displayConfigSummary !== generatedConfigSummary) ||
        (!existingOption.creditMultiplierOverridden &&
          existingOption.creditMultiplier !== generatedCreditMultiplier)
      : false;

    return {
      action: mergeResult.conflicts.length > 0
        ? "conflict"
        : existingOption
          ? hasGeneratedChanges
            ? "update"
            : "exists"
          : "create",
      modelId: input.model.id,
      providerId: input.model.providerId,
      publicName: buildPublicName(input.model.modelLabel, generatedConfigSummary),
      parameterValues: combination.parameterValues,
      normalizedParameterValues,
      requestParameters: mergeResult.value,
      hasRequestParameterConflict: mergeResult.conflicts.length > 0,
      conflictDetails: mergeResult.conflicts,
      generatedConfigSummary,
      displayConfigSummary,
      displayConfigSummaryOverridden: existingOption?.displayConfigSummaryOverridden ?? false,
      generatedCreditMultiplier,
      creditMultiplier,
      creditMultiplierOverridden: existingOption?.creditMultiplierOverridden ?? false,
      existingRuntimePresetId: existingOption?.id,
      existingAiOptionId: existingOption?.id
    };
  });
}

export function buildLegalCombinations<TValue extends { key: string; dependsOn?: Record<string, string> }>(
  dimensions: Array<{ key: string; values: TValue[] }>
): Array<{
  parameterValues: Record<string, string>;
  values: TValue[];
}> {
  let combinations: Array<{
    parameterValues: Record<string, string>;
    values: TValue[];
  }> = [{ parameterValues: {}, values: [] }];

  for (const dimension of dimensions) {
    const nextCombinations: typeof combinations = [];

    for (const combination of combinations) {
      const applicableValues = dimension.values.filter((value) =>
        isValueDependencySatisfied(value, combination.parameterValues)
      );

      if (applicableValues.length === 0) {
        // None of this dimension's values apply to the choices made so far
        // (e.g. they all depend on another dimension's value that wasn't
        // selected in this combination). Rather than discarding the whole
        // combination, this dimension simply contributes nothing to it.
        nextCombinations.push(combination);
        continue;
      }

      for (const value of applicableValues) {
        nextCombinations.push({
          parameterValues: {
            ...combination.parameterValues,
            [dimension.key]: value.key
          },
          values: [...combination.values, value]
        });
      }
    }

    combinations = nextCombinations;
  }

  return combinations;
}

export function isValueDependencySatisfied(
  value: { dependsOn?: Record<string, string> },
  parameterValues: Record<string, string>
): boolean {
  const dependencies = value.dependsOn ?? {};
  return Object.entries(dependencies).every(([key, expectedValue]) => parameterValues[key] === expectedValue);
}

export function buildConfigSummary(values: Array<{ summary?: string }>): string {
  return values
    .map((value) => value.summary ?? "")
    .filter((summary) => summary.length > 0)
    .join(" + ");
}

export function buildPublicName(modelLabel: string, generatedConfigSummary: string): string {
  return generatedConfigSummary ? `${modelLabel} ${generatedConfigSummary}` : modelLabel;
}

export function normalizeParameterValues(parameterValues: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(parameterValues).sort(([left], [right]) => left.localeCompare(right)));
}

export function createRequestIdentity(requestParameters: JsonObject): string {
  return JSON.stringify(sortJsonValue(requestParameters));
}

export function mergeRequestParameterFragments(values: Array<{ requestParameterFragment?: JsonObject }>): {
  value: JsonObject;
  conflicts: string[];
} {
  const result: JsonObject = {};
  const conflicts: string[] = [];

  for (const value of values) {
    mergeJsonObject(result, value.requestParameterFragment ?? {}, [], conflicts);
  }

  return {
    value: result,
    conflicts
  };
}

export function mergeJsonObject(
  target: JsonObject,
  source: JsonObject,
  path: string[],
  conflicts: string[]
): void {
  for (const [key, sourceValue] of Object.entries(source)) {
    const nextPath = [...path, key];
    const existingValue = target[key];

    if (existingValue === undefined) {
      target[key] = cloneJsonValue(sourceValue);
      continue;
    }

    if (isPlainObject(existingValue) && isPlainObject(sourceValue)) {
      mergeJsonObject(existingValue, sourceValue, nextPath, conflicts);
      continue;
    }

    if (!areJsonValuesEqual(existingValue, sourceValue)) {
      conflicts.push(nextPath.join("."));
    }
  }
}

export function isPlainObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortJsonValue(item));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortJsonValue(item)])
    );
  }

  return value;
}

export function cloneJsonValue<T>(value: T): T {
  if (!isPlainObject(value) && !Array.isArray(value)) {
    return value;
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

export function areJsonValuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function roundCreditMultiplier(value: number): number {
  return Math.round(value * 100) / 100;
}

export function toObjectRecord(value: unknown): JsonObject {
  return isPlainObject(value) ? value : {};
}

export function toStringRecord(value: unknown): Record<string, string> {
  if (!isPlainObject(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => typeof entryValue === "string") as Array<[string, string]>
  );
}

export function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export interface CreditCombinationRule {
  when: Record<string, string>;
  delta: number;
}

export interface TemplateGenerationInput {
  dimensions: AiOptionGenerationDimension[];
  requestDefaults: JsonObject;
  creditBaseMultiplier: number | null;
  creditCombinationRules: CreditCombinationRule[];
}

/**
 * Parses the `parameters` / `requestDefaults` / `creditBaseMultiplier` /
 * `creditCombinationRules` fields of a runtime template's parameter schema
 * JSON into the inputs needed to generate AI Option suggestions. Returns
 * null when the schema has no usable parameter dimensions.
 */
export function buildTemplateGenerationInputFromSchema(schema: JsonObject): TemplateGenerationInput | null {
  const parameters = Object.entries(toObjectRecord(schema.parameters));
  if (parameters.length === 0) {
    return null;
  }

  const requestDefaults = toObjectRecord(schema.requestDefaults);
  const creditBaseMultiplier = toFiniteNumber(schema.creditBaseMultiplier);
  const creditCombinationRules = parseCreditCombinationRules(schema.creditCombinationRules);

  const dimensions = parameters
    .map<AiOptionGenerationDimension | null>(([parameterKey, parameterDefinition]) => {
      const definition = toObjectRecord(parameterDefinition);
      const options = Array.isArray(definition.options) ? definition.options : [];
      if (options.length === 0) {
        return null;
      }

      const label = typeof definition.label === "string" && definition.label.trim() ? definition.label : parameterKey;
      const values = options
        .map((option) => buildTemplateGenerationValue(option))
        .filter((value): value is NonNullable<typeof value> => Boolean(value));

      if (values.length === 0) {
        return null;
      }

      return {
        key: parameterKey,
        label,
        values
      };
    })
    .filter((dimension): dimension is AiOptionGenerationDimension => Boolean(dimension));

  if (dimensions.length === 0) {
    return null;
  }

  return {
    dimensions,
    requestDefaults,
    creditBaseMultiplier,
    creditCombinationRules
  };
}

function buildTemplateGenerationValue(option: unknown): AiOptionGenerationValue | null {
  const optionRecord = toObjectRecord(option);
  const rawValue = optionRecord.internalKey;
  if (typeof rawValue !== "string" || !rawValue.trim()) {
    return null;
  }

  const summary = typeof optionRecord.summary === "string" ? optionRecord.summary : "";
  const dependsOn = toStringRecord(optionRecord.dependsOn);
  const requestParameterFragment = toObjectRecord(optionRecord.requestParameterFragment);
  const creditMultiplierDelta = toFiniteNumber(optionRecord.creditMultiplierDelta) ?? 0;

  return {
    key: rawValue,
    summary,
    creditMultiplierDelta,
    requestParameterFragment,
    dependsOn
  };
}

function parseCreditCombinationRules(value: unknown): CreditCombinationRule[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((rule) => {
      const ruleRecord = toObjectRecord(rule);
      const when = toStringRecord(ruleRecord.when);
      const delta = toFiniteNumber(ruleRecord.delta) ?? 0;
      return Object.keys(when).length > 0 ? { when, delta } : null;
    })
    .filter((rule): rule is CreditCombinationRule => rule !== null);
}

/**
 * Merges `requestDefaults` into a generated preview item's request
 * parameters, recording any conflicts between defaults and the
 * option-contributed fragments.
 */
export function applyTemplateRequestDefaults(
  item: AiOptionGenerationPreviewItem,
  requestDefaults: JsonObject
): AiOptionGenerationPreviewItem {
  if (Object.keys(requestDefaults).length === 0) {
    return item;
  }

  const mergedRequestParameters = cloneJsonValue(requestDefaults);
  const conflictDetails: string[] = [...item.conflictDetails];
  mergeJsonObject(mergedRequestParameters, item.requestParameters, [], conflictDetails);

  return {
    ...item,
    requestParameters: mergedRequestParameters,
    conflictDetails,
    hasRequestParameterConflict: conflictDetails.length > 0
  };
}

/**
 * Recomputes a generated preview item's credit multiplier using the
 * template's `creditBaseMultiplier` (falling back to `fallbackBaseCreditMultiplier`,
 * typically the model's base multiplier) plus the sum of each selected
 * value's `creditMultiplierDelta`, plus any matching `creditCombinationRules` deltas.
 */
export function applyTemplateCreditRules(
  item: AiOptionGenerationPreviewItem,
  fallbackBaseCreditMultiplier: number,
  creditBaseMultiplier: number | null,
  creditCombinationRules: CreditCombinationRule[]
): AiOptionGenerationPreviewItem {
  const deltaSum = item.generatedCreditMultiplier - fallbackBaseCreditMultiplier;
  const combinationDelta = creditCombinationRules
    .filter((rule) => Object.entries(rule.when).every(([key, expected]) => item.parameterValues[key] === expected))
    .reduce((total, rule) => total + rule.delta, 0);

  const generatedCreditMultiplier = roundCreditMultiplier(
    (creditBaseMultiplier ?? fallbackBaseCreditMultiplier) + deltaSum + combinationDelta
  );

  return {
    ...item,
    generatedCreditMultiplier,
    creditMultiplier: item.creditMultiplierOverridden ? item.creditMultiplier : generatedCreditMultiplier
  };
}
