import type { Page } from "playwright";

const SUBMIT_BUTTON_LABEL = "Сравнить карточки";

function selectedCardsCounterPattern(expectedCount: number): RegExp {
  return new RegExp(`Карточки для сравнения:\\s*${expectedCount}\\s+из\\s+5`, "u");
}

async function waitForSubmitButtonEnabled(page: Page): Promise<void> {
  const submitButton = page
    .getByRole("button", {
      name: SUBMIT_BUTTON_LABEL,
      exact: true
    })
    .last();

  await submitButton.waitFor({ state: "visible", timeout: 30_000 });

  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await submitButton.isEnabled().catch(() => false)) {
      return;
    }

    await page.waitForTimeout(500);
  }

  throw new Error("business_limit: compare cards submit button stayed disabled");
}

async function waitForSubmissionSuccess(page: Page): Promise<void> {
  try {
    await page.waitForFunction(
      () => {
        const bodyText = document.body.innerText || "";

        return (
          /Дата сравнения/u.test(bodyText) ||
          /Доступен\s+до/u.test(bodyText) ||
          /сравнен[иияе]\s+.*(создан|готов|формир)/iu.test(bodyText) ||
          /отч[её]т\s+.*(создан|готов|формир)/iu.test(bodyText)
        );
      },
      undefined,
      { timeout: 60_000 }
    );
  } catch (error) {
    if (/login|passport|auth/i.test(page.url())) {
      throw new Error(
        "auth_expired: WB Partners session is missing or expired. Run `pnpm run login`."
      );
    }

    const bodyText = await page.locator("body").innerText({ timeout: 5_000 }).catch(
      () => ""
    );

    if (
      /Что-то не так|Подозрительная активность|captcha-support|suspicious activity/iu.test(
        bodyText
      )
    ) {
      throw new Error(
        "captcha: WB showed suspicious activity screen. Wait before running automation again."
      );
    }

    throw error;
  }
}

async function waitForSuccessfulSubmitResponse(page: Page): Promise<boolean> {
  return page
    .waitForResponse(
      (response) => {
        const method = response.request().method();
        const status = response.status();

        return (
          method === "POST" &&
          status >= 200 &&
          status < 300 &&
          /compare|comparison|cards-comparison/i.test(response.url())
        );
      },
      { timeout: 30_000 }
    )
    .then(() => true)
    .catch(() => false);
}

export async function submitCompareCards(
  page: Page,
  expectedCount: number
): Promise<void> {
  await page
    .getByText(selectedCardsCounterPattern(expectedCount))
    .waitFor({ state: "visible", timeout: 30_000 });

  await waitForSubmitButtonEnabled(page);

  const submitButton = page
    .getByRole("button", {
      name: SUBMIT_BUTTON_LABEL,
      exact: true
    })
    .last();

  const successfulSubmitResponse = waitForSuccessfulSubmitResponse(page);

  await submitButton.click();
  if (await successfulSubmitResponse) {
    return;
  }

  await waitForSubmissionSuccess(page);
}
