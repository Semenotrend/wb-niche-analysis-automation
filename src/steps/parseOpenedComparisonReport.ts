import { createHash } from "node:crypto";
import type { Page } from "playwright";
import type { ParsedExistingComparisonReport } from "./parseExistingComparisonList.js";

const RUSSIAN_MONTHS: Record<string, number> = {
  января: 1,
  февраль: 2,
  февраля: 2,
  март: 3,
  марта: 3,
  апрель: 4,
  апреля: 4,
  май: 5,
  мая: 5,
  июнь: 6,
  июня: 6,
  июль: 7,
  июля: 7,
  август: 8,
  августа: 8,
  сентябрь: 9,
  сентября: 9,
  октябрь: 10,
  октября: 10,
  ноябрь: 11,
  ноября: 11,
  декабрь: 12,
  декабря: 12
};

const MONTH_NAMES = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря"
];

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function moscowDateParts(now: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "numeric",
    day: "numeric"
  }).formatToParts(now);

  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new Error("schema_changed: could not format Moscow comparison date");
  }

  return { year, month, day };
}

function comparisonDate(now: Date): { text: string; iso: string } {
  const { year, month, day } = moscowDateParts(now);
  return {
    text: `${day} ${MONTH_NAMES[month - 1]}`,
    iso: `${year}-${pad(month)}-${pad(day)}`
  };
}

function inferYear(month: number, day: number, now: Date): number {
  let year = now.getFullYear();
  const candidateUtc = Date.UTC(year, month - 1, day, 12, 0, 0);
  const nowUtc = now.getTime();
  const halfYearMs = 183 * 24 * 60 * 60 * 1000;

  if (candidateUtc - nowUtc > halfYearMs) {
    year -= 1;
  } else if (nowUtc - candidateUtc > halfYearMs) {
    year += 1;
  }

  return year;
}

function parseAvailableUntilText(availableUntilText: string, now: Date): string | null {
  const match = availableUntilText.match(
    /Доступен\s+до\s+(\d{1,2})\s+([А-Яа-яЁё]+),\s*(\d{1,2}):(\d{2})/u
  );

  if (match === null) {
    return null;
  }

  const day = Number(match[1]);
  const month = RUSSIAN_MONTHS[match[2].toLowerCase()];
  const hour = Number(match[3]);
  const minute = Number(match[4]);

  if (month === undefined) {
    return null;
  }

  const year = inferYear(month, day, now);
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00+03:00`;
}

function reportFingerprint(comparisonRequestId: string, nmIds: string[], rawText: string): string {
  return createHash("sha256")
    .update(
      [
        "submitted_compare_cards_report",
        comparisonRequestId,
        nmIds.join("|"),
        normalizeText(rawText).slice(0, 500)
      ].join("\n")
    )
    .digest("hex");
}

export async function parseOpenedComparisonReport(
  page: Page,
  options: {
    comparisonRequestId: string;
    nmIds: string[];
  }
): Promise<ParsedExistingComparisonReport> {
  await page.getByRole("button", { name: "История сравнений", exact: true }).waitFor({
    state: "visible",
    timeout: 60_000
  });

  const pageState = await page.evaluate<{
    rawText: string;
    availableUntilText: string | null;
    url: string;
  }>(() => {
    const rawText = document.body.innerText || "";
    const availableUntilText =
      rawText.match(/Доступен\s+до\s+\d{1,2}\s+[А-Яа-яЁё]+,\s*\d{1,2}:\d{2}/u)?.[0] ??
      null;

    return {
      rawText: rawText.slice(0, 5000),
      availableUntilText,
      url: location.href
    };
  });

  const now = new Date();
  const date = comparisonDate(now);
  const availableUntilText =
    pageState.availableUntilText ?? "Открыт после создания сравнения";

  return {
    listRank: 1,
    comparisonDateText: date.text,
    comparisonDate: date.iso,
    availableUntilText,
    availableUntilAt: parseAvailableUntilText(availableUntilText, now),
    cardsCount: options.nmIds.length,
    previewItems: options.nmIds.map((nmId, index) => ({
      slotPosition: index + 1,
      nmId,
      productName: null,
      productUrl: `https://www.wildberries.ru/catalog/${nmId}/detail.aspx`,
      imageUrl: null,
      rawText: nmId
    })),
    reportFingerprint: reportFingerprint(
      options.comparisonRequestId,
      options.nmIds,
      pageState.rawText
    ),
    rawText: pageState.rawText,
    rawPayload: {
      source: "opened_after_compare_cards_submit",
      sourceUrl: pageState.url,
      comparisonRequestId: options.comparisonRequestId,
      nmIds: options.nmIds
    }
  };
}
