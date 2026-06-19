import { config as loadDotenv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getDefaultApiBaseUrl } from "@zebragate/config";
import { DEFAULT_DAILY_CHECKIN_CREDITS, DEFAULT_REGISTER_GIFT_CREDITS } from "../services/credits.js";

export interface ApiEnv {
  apiBaseUrl: string;
  port: number;
  host: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  resendApiKey: string;
  freeDailySiteBudgetCredits: number;
  freeDailyUserLimitCredits: number;
  defaultRegisterGiftCredits: number;
  defaultDailyCheckinCredits: number;
  adminUsername: string;
  adminPassword: string;
}

export interface ApiEnvHealth {
  hasSupabaseUrl: boolean;
  hasSupabaseServiceRoleKey: boolean;
}

let envFilesLoaded = false;

function getNumberEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function loadApiEnvFiles(): void {
  if (envFilesLoaded) {
    return;
  }

  const currentDir = dirname(fileURLToPath(import.meta.url));
  const repoRootEnvPath = resolve(currentDir, "../../../../.env");
  const apiEnvPath = resolve(currentDir, "../../.env");

  loadDotenv({ path: repoRootEnvPath, override: false });
  loadDotenv({ path: apiEnvPath, override: true });

  envFilesLoaded = true;
}

export function getEnv(): ApiEnv {
  loadApiEnvFiles();

  return {
    apiBaseUrl: process.env.API_BASE_URL ?? getDefaultApiBaseUrl(),
    port: getNumberEnv("PORT", 3001),
    host: process.env.HOST ?? "0.0.0.0",
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    resendApiKey: process.env.RESEND_API_KEY ?? "",
    freeDailySiteBudgetCredits: getNumberEnv("FREE_DAILY_SITE_BUDGET_CREDITS", 500000),
    freeDailyUserLimitCredits: getNumberEnv("FREE_DAILY_USER_LIMIT_CREDITS", 5000),
    defaultRegisterGiftCredits: getNumberEnv("DEFAULT_REGISTER_GIFT_CREDITS", DEFAULT_REGISTER_GIFT_CREDITS),
    defaultDailyCheckinCredits: getNumberEnv("DEFAULT_DAILY_CHECKIN_CREDITS", DEFAULT_DAILY_CHECKIN_CREDITS),
    adminUsername: process.env.ZEBRAGATE_ADMIN_USERNAME ?? "",
    adminPassword: process.env.ZEBRAGATE_ADMIN_PASSWORD ?? ""
  };
}

export function getEnvHealth(): ApiEnvHealth {
  const env = getEnv();

  return {
    hasSupabaseUrl: env.supabaseUrl.length > 0,
    hasSupabaseServiceRoleKey: env.supabaseServiceRoleKey.length > 0
  };
}
