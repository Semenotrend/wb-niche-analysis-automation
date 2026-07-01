import type { Page } from "playwright";

export async function setNichePeriod(page: Page, period: string): Promise<void> {
  const periodName = period.trim();

  if (periodName === "") {
    throw new Error("config: scenario.period must not be empty");
  }

  const periodButton = page.getByRole("button", {
    name: periodName,
    exact: true
  });

  await periodButton.waitFor({ state: "visible", timeout: 30_000 });
  await periodButton.click();

  await page.waitForFunction(
    (expectedPeriod) => {
      const buttons = [...document.querySelectorAll("button")];
      const selectedPeriod = buttons.find(
        (button) =>
          button.textContent?.replace(/\s+/g, " ").trim() === expectedPeriod
      );

      return Boolean(selectedPeriod?.className.toString().includes("isActive"));
    },
    periodName,
    { timeout: 30_000 }
  );

  await page.getByText("Данные за период", { exact: false }).waitFor({
    state: "visible",
    timeout: 30_000
  });
}

export async function setNichePeriodMonth(page: Page): Promise<void> {
  await setNichePeriod(page, "Месяц");
}
