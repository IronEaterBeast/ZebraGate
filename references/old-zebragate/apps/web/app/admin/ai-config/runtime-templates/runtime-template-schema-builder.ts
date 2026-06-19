export interface BuilderOption {
  internalKey: string;
  summary: string;
  creditMultiplierDelta: string;
  requestParameterFragmentJson: string;
  dependsOn: Array<{ paramKey: string; internalKey: string }>;
}

export interface BuilderParameter {
  key: string;
  label: string;
  options: BuilderOption[];
}

export type ParseRequestParameterFragmentResult =
  | { value: Record<string, unknown> }
  | { error: string };

export function parseRequestParameterFragment(text: string): ParseRequestParameterFragmentResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { value: {} };
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { error: "请求片段必须是 JSON 对象（如 {} 或 { \"key\": \"value\" }）。" };
    }

    return { value: parsed as Record<string, unknown> };
  } catch {
    return { error: "请求片段不是合法的 JSON，请检查格式。" };
  }
}

function buildOptionObject(option: BuilderOption): Record<string, unknown> {
  const creditMultiplierDelta = Number(option.creditMultiplierDelta);
  const fragmentResult = parseRequestParameterFragment(option.requestParameterFragmentJson);
  const requestParameterFragment = "value" in fragmentResult ? fragmentResult.value : {};

  const result: Record<string, unknown> = {
    internalKey: option.internalKey,
    summary: option.summary,
    requestParameterFragment,
    creditMultiplierDelta: Number.isFinite(creditMultiplierDelta) ? creditMultiplierDelta : 0
  };

  if (option.dependsOn.length > 0) {
    result.dependsOn = Object.fromEntries(
      option.dependsOn.map((dependency) => [dependency.paramKey, dependency.internalKey])
    );
  }

  return result;
}

export function buildParametersObject(parameters: BuilderParameter[]): Record<string, unknown> {
  return Object.fromEntries(
    parameters.map((parameter) => [
      parameter.key,
      {
        label: parameter.label,
        options: parameter.options.map(buildOptionObject)
      }
    ])
  );
}

function parseDependsOn(value: unknown): Array<{ paramKey: string; internalKey: string }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  return Object.entries(value as Record<string, unknown>)
    .filter(([, internalKey]) => typeof internalKey === "string")
    .map(([paramKey, internalKey]) => ({ paramKey, internalKey: internalKey as string }));
}

function parseOption(value: unknown): BuilderOption | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const internalKey = record.internalKey;
  if (typeof internalKey !== "string") {
    return null;
  }

  const requestParameterFragment = record.requestParameterFragment;
  const requestParameterFragmentJson =
    requestParameterFragment && typeof requestParameterFragment === "object" && !Array.isArray(requestParameterFragment)
      ? Object.keys(requestParameterFragment as Record<string, unknown>).length > 0
        ? JSON.stringify(requestParameterFragment)
        : ""
      : "";

  const creditMultiplierDelta = record.creditMultiplierDelta;

  return {
    internalKey,
    summary: typeof record.summary === "string" ? record.summary : "",
    creditMultiplierDelta:
      typeof creditMultiplierDelta === "number" && creditMultiplierDelta !== 0 ? String(creditMultiplierDelta) : "",
    requestParameterFragmentJson,
    dependsOn: parseDependsOn(record.dependsOn)
  };
}

/**
 * Reverse of buildParametersObject: reconstructs builder state from the
 * `parameters` field of a parameter schema JSON, so the builder can show and
 * let admins edit dimensions that were defined outside the builder (e.g. by
 * hand-editing the JSON textarea or loaded from an existing template).
 * Entries that don't match the builder's shape are silently skipped.
 */
export function parseParametersFromSchemaJson(jsonText: string): BuilderParameter[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return [];
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return [];
  }

  const parameters = (parsed as Record<string, unknown>).parameters;
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) {
    return [];
  }

  const result: BuilderParameter[] = [];
  for (const [key, value] of Object.entries(parameters as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      continue;
    }

    const record = value as Record<string, unknown>;
    const label = typeof record.label === "string" ? record.label : key;
    const rawOptions = Array.isArray(record.options) ? record.options : [];
    const options = rawOptions.map(parseOption).filter((option): option is BuilderOption => option !== null);

    result.push({ key, label, options });
  }

  return result;
}

export function mergeParametersIntoSchemaJson(currentJsonText: string, parameters: BuilderParameter[]): string {
  const parametersObject = buildParametersObject(parameters);

  let base: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(currentJsonText) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      base = parsed as Record<string, unknown>;
    }
  } catch {
    base = {};
  }

  return JSON.stringify({ ...base, parameters: parametersObject }, null, 2);
}
