import type { Page } from "playwright";
import { InvalidNicheUrlError } from "../core/incidents.js";

export type OpenNicheReportResult = {
  wbSubjectId: number;
  sourceUrl: string;
};

function parseSubjectId(url: string): number {
  const parsedUrl = new URL(url);
  const rawId = parsedUrl.searchParams.get("id");
  const subjectId = rawId === null ? NaN : Number(rawId);

  if (!Number.isInteger(subjectId) || subjectId <= 0) {
    throw new InvalidNicheUrlError(`Invalid niche report url id: ${url}`);
  }

  return subjectId;
}

export async function openNicheReportByUrl(
  page: Page,
  url: string,
  expectedSubject: string
): Promise<OpenNicheReportResult> {
  try {
    const expectedSubjectId = parseSubjectId(url);

    await page.goto(url, { waitUntil: "domcontentloaded" });

    await page.waitForURL(/\/platform-analytics\/niche-analysis\/item/, {
      timeout: 60_000,
      waitUntil: "domcontentloaded"
    });

    const currentUrl = page.url();
    const actualSubjectId = parseSubjectId(currentUrl);

    if (actualSubjectId !== expectedSubjectId) {
      throw new InvalidNicheUrlError(
        `Niche report url opened another subject id: expected=${expectedSubjectId}, actual=${actualSubjectId}`
      );
    }

    await page.waitForFunction(
      `subject => {
        const bodyText = (document.body.textContent || "").replace(/\\s+/g, " ").trim();

        return (
          bodyText.includes(subject) &&
          bodyText.includes("Данные за период") &&
          bodyText.includes("Поисковые запросы")
        );
      }`,
      expectedSubject,
      { timeout: 60_000 }
    );

    return {
      wbSubjectId: actualSubjectId,
      sourceUrl: currentUrl
    };
  } catch (error) {
    if (error instanceof InvalidNicheUrlError) {
      throw error;
    }

    throw new InvalidNicheUrlError(
      `Niche report url did not open expected report: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
