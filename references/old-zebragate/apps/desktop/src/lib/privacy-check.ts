import sensitiveKeywords from "./privacy-keywords.json";

export interface PrivacyCheckResult {
  flagged: boolean;
  matchedKeywords: string[];
}

export function detectSensitiveKeywords(text: string): PrivacyCheckResult {
  const normalizedText = text.toLowerCase();
  const matchedKeywords = sensitiveKeywords.filter((keyword) =>
    normalizedText.includes(keyword.toLowerCase())
  );

  return {
    flagged: matchedKeywords.length > 0,
    matchedKeywords
  };
}
