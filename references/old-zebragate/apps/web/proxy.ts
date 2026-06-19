import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { verifyAdminAuthorizationHeader } from "./lib/admin-auth-core";

export function proxy(request: NextRequest) {
  const result = verifyAdminAuthorizationHeader(request.headers.get("authorization"));
  if (result.ok) {
    return NextResponse.next();
  }

  // Browsers only re-prompt the built-in Basic Auth dialog on 401 + WWW-Authenticate.
  const response = new NextResponse("Authentication required.", { status: 401 });
  response.headers.set("WWW-Authenticate", 'Basic realm="ZebraGate Admin"');
  return response;
}

export const config = {
  matcher: ["/admin/:path*"]
};
