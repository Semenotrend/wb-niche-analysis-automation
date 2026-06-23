import type { Page } from "playwright";

export async function setNichePeriodMonth(page: Page): Promise<void> {
  const monthButton = page.getByRole("button", { name: "Месяц", exact: true });

  await monthButton.waitFor({ state: "visible", timeout: 30_000 });
  await monthButton.click();

  await page.waitForFunction(() => {
    const buttons = [...document.querySelectorAll("button")];
    const month = buttons.find(
      (button) => button.textContent?.replace(/\s+/g, " ").trim() === "Месяц"
    );

    return Boolean(month?.className.toString().includes("isActive"));
  });

  await page.getByText("Данные за период", { exact: false }).waitFor({
    state: "visible",
    timeout: 30_000
  });
}
