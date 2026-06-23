export type IncidentType =
  | "auth_expired"
  | "captcha"
  | "selector_changed"
  | "popup_blocking"
  | "timeout"
  | "business_limit"
  | "empty_result"
  | "invalid_niche_url"
  | "schema_changed"
  | "unknown_screen";

export class InvalidNicheUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidNicheUrlError";
  }
}

export function classifyIncident(error: unknown): IncidentType {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  if (normalized.includes("captcha") || normalized.includes("капч")) {
    return "captcha";
  }

  if (
    normalized.includes("auth") ||
    normalized.includes("login") ||
    normalized.includes("unauthorized") ||
    normalized.includes("авториза")
  ) {
    return "auth_expired";
  }

  if (normalized.includes("timeout") || normalized.includes("timed out")) {
    return "timeout";
  }

  if (
    error instanceof InvalidNicheUrlError ||
    normalized.includes("invalid_niche_url") ||
    normalized.includes("invalid niche url") ||
    normalized.includes("niche report url")
  ) {
    return "invalid_niche_url";
  }

  if (
    normalized.includes("strict mode") ||
    normalized.includes("locator") ||
    normalized.includes("selector") ||
    normalized.includes("waiting for")
  ) {
    return "selector_changed";
  }

  if (
    normalized.includes("modal") ||
    normalized.includes("popup") ||
    normalized.includes("overlay") ||
    normalized.includes("перекры")
  ) {
    return "popup_blocking";
  }

  if (normalized.includes("limit") || normalized.includes("лимит")) {
    return "business_limit";
  }

  if (
    normalized.includes("empty") ||
    normalized.includes("no result") ||
    normalized.includes("нет карточ")
  ) {
    return "empty_result";
  }

  if (normalized.includes("schema") || normalized.includes("parser")) {
    return "schema_changed";
  }

  return "unknown_screen";
}
