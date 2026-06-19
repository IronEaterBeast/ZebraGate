export type BasicAuthValidationResult =
  | { ok: true }
  | { ok: false; reason: "missing" | "invalid" };

export function validateBasicAuthHeader(
  authorization: string | null | undefined,
  expectedUsername: string,
  expectedPassword: string
): BasicAuthValidationResult {
  if (!authorization?.startsWith("Basic ")) {
    return { ok: false, reason: "missing" };
  }

  const decoded = decodeBasicAuthorization(authorization);
  if (!decoded) {
    return { ok: false, reason: "invalid" };
  }

  const usernameMatches = safeEqual(decoded.username, expectedUsername);
  const passwordMatches = safeEqual(decoded.password, expectedPassword);

  return usernameMatches && passwordMatches
    ? { ok: true }
    : { ok: false, reason: "invalid" };
}

export function decodeBasicAuthorization(authorization: string): { username: string; password: string } | null {
  try {
    const encoded = authorization.slice("Basic ".length);
    const decoded = decodeBase64ToUtf8(encoded);
    const separatorIndex = decoded.indexOf(":");

    if (separatorIndex < 0) {
      return null;
    }

    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1)
    };
  } catch {
    return null;
  }
}

function safeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const maxLength = Math.max(leftBytes.length, rightBytes.length);
  let diff = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < maxLength; index += 1) {
    diff |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return diff === 0;
}

function decodeBase64ToUtf8(value: string): string {
  if (typeof globalThis.atob === "function") {
    const decoded = globalThis.atob(value);
    const bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "base64").toString("utf8");
  }

  throw new Error("No base64 decoder is available.");
}
