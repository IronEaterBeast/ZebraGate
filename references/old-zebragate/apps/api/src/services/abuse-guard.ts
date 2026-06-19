export interface AbuseGuardContext {
  userId?: string;
  ip?: string;
  deviceId?: string;
  messageCount?: number;
  maxTokens?: number;
}

export async function checkRateLimit(context: AbuseGuardContext): Promise<boolean> {
  void context;
  // TODO: MVP add per-user and per-IP rate limiting backed by Redis or database counters.
  return true;
}

export async function checkBudget(context: AbuseGuardContext): Promise<boolean> {
  void context;
  // TODO: MVP enforce global daily budget and per-user daily budget from environment config.
  return true;
}

export async function checkConcurrency(context: AbuseGuardContext): Promise<boolean> {
  void context;
  // TODO: MVP block abusive concurrent request patterns.
  return true;
}

export async function checkContextLimit(context: AbuseGuardContext): Promise<boolean> {
  void context;
  // TODO: MVP enforce per-request context length limits before provider routing.
  return true;
}

export async function checkOutputLimit(context: AbuseGuardContext): Promise<boolean> {
  void context;
  // TODO: MVP enforce per-request output size limits before provider routing.
  return true;
}
