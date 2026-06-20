import type { TFunction } from "i18next";

export function formatGroupLastUsedAt(t: TFunction, lastUsedAt: number | null): string {
  if (lastUsedAt === null) {
    return t("common.neverUsed");
  }

  const date = new Date(lastUsedAt * 1000);
  const year = date.getFullYear();
  const month = padDatePart(date.getMonth() + 1);
  const day = padDatePart(date.getDate());
  const hours = padDatePart(date.getHours());
  const minutes = padDatePart(date.getMinutes());
  const seconds = padDatePart(date.getSeconds());

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function padDatePart(value: number): string {
  return value.toString().padStart(2, "0");
}
