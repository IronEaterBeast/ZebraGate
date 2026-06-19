import { validateBasicAuthHeader } from "@zebragate/shared";

export function verifyAdminAuthorizationHeader(authorization: string | null | undefined): {
  ok: boolean;
  status: 200 | 401 | 403;
} {
  const adminUsername = process.env.ZEBRAGATE_ADMIN_USERNAME?.trim() ?? "";
  const adminPassword = process.env.ZEBRAGATE_ADMIN_PASSWORD?.trim() ?? "";

  if (!adminUsername || !adminPassword) {
    return { ok: false, status: 403 };
  }

  const validation = validateBasicAuthHeader(authorization, adminUsername, adminPassword);
  if (validation.ok) {
    return { ok: true, status: 200 };
  }

  return {
    ok: false,
    status: validation.reason === "missing" ? 401 : 403
  };
}
