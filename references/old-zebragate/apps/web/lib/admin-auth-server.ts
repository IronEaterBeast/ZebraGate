import { headers } from "next/headers";
import { verifyAdminAuthorizationHeader } from "./admin-auth-core";

export async function assertAdminServerActionAuthenticated(): Promise<void> {
  const headerStore = await headers();
  const result = verifyAdminAuthorizationHeader(headerStore.get("authorization"));

  if (result.ok) {
    return;
  }

  throw new Error(result.status === 401 ? "Admin authentication is required." : "Invalid admin credentials.");
}
