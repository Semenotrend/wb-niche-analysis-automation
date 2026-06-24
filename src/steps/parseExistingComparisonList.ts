import { createHash } from "node:crypto";
import type { Page } from "playwright";

export type ParsedComparisonPreviewItem = {
  slotPosition: number;
  nmId: string | null;
  productName: string | null;
  productUrl: string | null;
  imageUrl: string | null;
  rawText: string;
};

export type ParsedExistingComparisonReport = {
  listRank: number;
  comparisonDateText: string | null;
  comparisonDate: string | null;
  availableUntilText: string;
  availableUntilAt: string | null;
  cardsCount: number;
  previewItems: ParsedComparisonPreviewItem[];
  reportFingerprint: string;
  rawText: string;
  rawPayload: Record<string, unknown>;
};

type DomPreviewItem = {
  nmId: string | null;
  productName: string | null;
  productUrl: string | null;
  imageUrl: string | null;
  rawText: string;
};

type DomExistingComparisonReport = {
  comparisonDateText: string | null;
  availableUntilText: string;
  previewItems: DomPreviewItem[];
  rawText: string;
  rawPayload: Record<string, unknown>;
};

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

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function toMoscowIso(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): string {
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00+03:00`;
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

function parseAvailableUntilText(
  availableUntilText: string,
  now: Date
): { iso: string | null; year: number | null } {
  const match = availableUntilText.match(
    /Доступен\s+до\s+(\d{1,2})\s+([А-Яа-яЁё]+),\s*(\d{1,2}):(\d{2})/u
  );

  if (match === null) {
    return { iso: null, year: null };
  }

  const day = Number(match[1]);
  const month = RUSSIAN_MONTHS[match[2].toLowerCase()];
  const hour = Number(match[3]);
  const minute = Number(match[4]);

  if (month === undefined) {
    return { iso: null, year: null };
  }

  const year = inferYear(month, day, now);
  return {
    iso: toMoscowIso(year, month, day, hour, minute),
    year
  };
}

function parseRussianDateOnly(
  dateText: string | null,
  preferredYear: number | null,
  now: Date
): string | null {
  if (dateText === null) {
    return null;
  }

  const match = dateText.match(/^(\d{1,2})\s+([А-Яа-яЁё]+)$/u);

  if (match === null) {
    return null;
  }

  const day = Number(match[1]);
  const month = RUSSIAN_MONTHS[match[2].toLowerCase()];

  if (month === undefined) {
    return null;
  }

  const year = preferredYear ?? inferYear(month, day, now);
  return `${year}-${pad(month)}-${pad(day)}`;
}

function buildReportFingerprint(report: {
  comparisonDateText: string | null;
  availableUntilText: string;
  previewItems: Array<{ nmId: string | null; productName: string | null }>;
  rawText: string;
}): string {
  const itemKey = report.previewItems
    .map((item) => item.nmId ?? item.productName ?? "")
    .join("|");

  return createHash("sha256")
    .update(
      [
        report.comparisonDateText ?? "",
        report.availableUntilText,
        itemKey,
        normalizeText(report.rawText).slice(0, 500)
      ].join("\n")
    )
    .digest("hex");
}

function toPreviewItems(items: DomPreviewItem[]): ParsedComparisonPreviewItem[] {
  return items.slice(0, 10).map((item, index) => ({
    slotPosition: index + 1,
    nmId: item.nmId,
    productName: item.productName,
    productUrl: item.productUrl,
    imageUrl: item.imageUrl,
    rawText: item.rawText
  }));
}

export async function parseExistingComparisonList(
  page: Page
): Promise<ParsedExistingComparisonReport[]> {
  await page.getByText("Дата сравнения", { exact: true }).waitFor({
    state: "visible",
    timeout: 60_000
  });

  await page.getByText(/Доступен\s+до/u).first().waitFor({
    state: "visible",
    timeout: 60_000
  });

  const domReports = await page.evaluate<DomExistingComparisonReport[]>(`
    (() => {
      const normalize = (value) => value.replace(/\\s+/g, " ").trim();
      const toLines = (value) => value
        .split(/\\n+/)
        .map((line) => normalize(line))
        .filter(Boolean);
      const availableRegex = /^Доступен\\s+до\\s+\\d{1,2}\\s+[А-Яа-яЁё]+,\\s*\\d{1,2}:\\d{2}$/u;
      const dateRegex = /^\\d{1,2}\\s+[А-Яа-яЁё]+$/u;
      const nmIdRegex = /\\b\\d{7,12}\\b/g;
      const seenContainers = new Set();

      const normalizeProductUrl = (href) => {
        if (!href) {
          return null;
        }

        return href.startsWith("http") ? href : "https://www.wildberries.ru" + href;
      };

      const findReportContainer = (badge) => {
        let node = badge;
        let best = badge;

        for (let depth = 0; node !== null && depth < 12; depth += 1) {
          const text = normalize(node.innerText || node.textContent || "");
          const ids = text.match(nmIdRegex) || [];
          const linkCount = node.querySelectorAll(
            'a[href*="/catalog/"][href*="/detail.aspx"]'
          ).length;
          const imageCount = node.querySelectorAll("img").length;

          if (
            text.includes("Доступен до") &&
            text.length < 8000 &&
            (ids.length > 0 || linkCount > 0 || imageCount > 0)
          ) {
            best = node;
          }

          node = node.parentElement;
        }

        return best;
      };

      const findItemContainer = (element) => {
        let node = element;
        let best = element;

        for (let depth = 0; node !== null && depth < 6; depth += 1) {
          const text = normalize(node.innerText || node.textContent || "");

          if (text.length > 0 && text.length < 1200) {
            best = node;
          }

          node = node.parentElement;
        }

        return best;
      };

      const productNameFromLines = (lines, nmId) => {
        if (nmId === null) {
          return lines.find((line) => !dateRegex.test(line) && !availableRegex.test(line)) || null;
        }

        const idIndex = lines.findIndex((line) => line === nmId || line.includes(nmId));

        if (idIndex <= 0) {
          return null;
        }

        for (let index = idIndex - 1; index >= 0; index -= 1) {
          const line = lines[index];

          if (!line || dateRegex.test(line) || availableRegex.test(line) || /^\\d+$/.test(line)) {
            continue;
          }

          return line;
        }

        return null;
      };

      const extractItems = (container) => {
        const itemByNmId = new Map();
        const looseItems = [];
        const links = [
          ...container.querySelectorAll('a[href*="/catalog/"][href*="/detail.aspx"]')
        ];

        for (const link of links) {
          const href = link.getAttribute("href") || "";
          const match = href.match(/\\/catalog\\/(\\d+)\\/detail\\.aspx/);
          const nmId = match ? match[1] : null;
          const itemContainer = findItemContainer(link);
          const rawText = normalize(itemContainer.innerText || itemContainer.textContent || "");
          const lines = toLines(itemContainer.innerText || itemContainer.textContent || "");
          const image = itemContainer.querySelector("img");
          const item = {
            nmId,
            productName: productNameFromLines(lines, nmId),
            productUrl: normalizeProductUrl(href),
            imageUrl: image ? image.currentSrc || image.src || image.getAttribute("src") : null,
            rawText
          };

          if (nmId !== null) {
            itemByNmId.set(nmId, item);
          } else {
            looseItems.push(item);
          }
        }

        const containerLines = toLines(container.innerText || container.textContent || "");
        const textNmIds = [...new Set((containerLines.join("\\n").match(nmIdRegex) || []))];

        for (const nmId of textNmIds) {
          if (itemByNmId.has(nmId)) {
            continue;
          }

          const idIndex = containerLines.findIndex((line) => line === nmId || line.includes(nmId));
          const productName = productNameFromLines(containerLines, nmId);
          const rawText = containerLines.slice(Math.max(0, idIndex - 2), idIndex + 2).join("\\n");

          itemByNmId.set(nmId, {
            nmId,
            productName,
            productUrl: null,
            imageUrl: null,
            rawText
          });
        }

        if (itemByNmId.size === 0) {
          const images = [...container.querySelectorAll("img")].slice(0, 10);

          for (const image of images) {
            const itemContainer = findItemContainer(image);
            const rawText = normalize(itemContainer.innerText || itemContainer.textContent || "");
            const lines = toLines(itemContainer.innerText || itemContainer.textContent || "");

            looseItems.push({
              nmId: null,
              productName: productNameFromLines(lines, null),
              productUrl: null,
              imageUrl: image.currentSrc || image.src || image.getAttribute("src"),
              rawText
            });
          }
        }

        return [...itemByNmId.values(), ...looseItems].slice(0, 10);
      };

      const badges = [...document.querySelectorAll("body *")].filter((element) => {
        const text = normalize(element.textContent || "");
        return availableRegex.test(text);
      });

      const reports = [];

      for (const badge of badges) {
        const container = findReportContainer(badge);

        if (seenContainers.has(container)) {
          continue;
        }

        seenContainers.add(container);

        const rawText = (container.innerText || container.textContent || "").trim();
        const lines = toLines(rawText);
        const availableUntilText = normalize(badge.textContent || "");
        const availableIndex = lines.findIndex((line) => line === availableUntilText);
        let comparisonDateText = null;

        for (let index = Math.max(availableIndex - 1, 0); index >= 0; index -= 1) {
          if (dateRegex.test(lines[index])) {
            comparisonDateText = lines[index];
            break;
          }
        }

        const rect = container.getBoundingClientRect();
        const previewItems = extractItems(container);

        reports.push({
          comparisonDateText,
          availableUntilText,
          previewItems,
          rawText,
          rawPayload: {
            domRect: {
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              width: Math.round(rect.width),
              height: Math.round(rect.height)
            },
            lineCount: lines.length
          }
        });
      }

      return reports;
    })()
  `);

  const now = new Date();
  const reports = domReports.map((report, index) => {
    const availableUntil = parseAvailableUntilText(report.availableUntilText, now);
    const previewItems = toPreviewItems(report.previewItems);
    const cardsCount = previewItems.length;

    return {
      listRank: index + 1,
      comparisonDateText: report.comparisonDateText,
      comparisonDate: parseRussianDateOnly(
        report.comparisonDateText,
        availableUntil.year,
        now
      ),
      availableUntilText: report.availableUntilText,
      availableUntilAt: availableUntil.iso,
      cardsCount,
      previewItems,
      reportFingerprint: buildReportFingerprint({
        comparisonDateText: report.comparisonDateText,
        availableUntilText: report.availableUntilText,
        previewItems,
        rawText: report.rawText
      }),
      rawText: report.rawText,
      rawPayload: report.rawPayload
    };
  });

  if (reports.length === 0) {
    throw new Error("empty_result: no existing comparison reports were found");
  }

  return reports;
}
