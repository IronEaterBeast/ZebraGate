export interface AdminCredentials {
  username: string;
  password: string;
}

const DEFAULT_LOCAL_PROXY_PORT = 7788;

export function getDefaultApiBaseUrl(): string {
  return process.env.API_BASE_URL ?? "http://localhost:3001";
}

export function getDefaultAdminCredentials(): AdminCredentials {
  return {
    username: process.env.ZEBRAGATE_ADMIN_USERNAME ?? "admin",
    password: process.env.ZEBRAGATE_ADMIN_PASSWORD ?? "change-me"
  };
}

export function getDefaultLocalProxyPort(): number {
  const rawPort = process.env.DEFAULT_LOCAL_PROXY_PORT;
  const parsedPort = rawPort ? Number(rawPort) : DEFAULT_LOCAL_PROXY_PORT;
  return Number.isFinite(parsedPort) ? parsedPort : DEFAULT_LOCAL_PROXY_PORT;
}
