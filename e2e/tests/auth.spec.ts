import { expect, test } from "@playwright/test";
import { twoFactorMockCode, urls } from "../environment.mjs";
import { users } from "../fixtures/data.mjs";
import { enterTwoFactorCode, submitPassword } from "../support/helpers";

test("CRM: first login sets up 2FA, survives a wrong code and returns to the deep link", async ({
  page,
}) => {
  await page.goto(`${urls.crm}/clients`);
  await expect(page).toHaveURL(/\/login\?next=%2Fclients/);

  await submitPassword(page, users.newcomer.login);
  await expect(page.getByRole("heading", { name: "Подключите приложение" })).toBeVisible();
  await expect(page.getByAltText("QR-код для приложения-аутентификатора")).toBeVisible();

  // AUTH-04: after a rejected code the fields are cleared, focus returns to the
  // first digit and the visible button still submits.
  await enterTwoFactorCode(page, "123456");
  await expect(page.getByRole("alert").filter({ hasText: "Код неверный" })).toBeVisible();
  const firstDigit = page.getByLabel("Цифра 1 из 6");
  await expect(firstDigit).toHaveValue("");
  await expect(firstDigit).toBeFocused();
  await expect(page.getByRole("heading", { name: "Подключите приложение" })).toBeVisible();

  await enterTwoFactorCode(page, twoFactorMockCode);
  const codesHeading = page.getByRole("heading", { name: "Сохраните коды" });
  await expect(codesHeading).toBeFocused();
  const codes = page.locator("code");
  await expect(codes).toHaveCount(8);
  await expect(codes.first()).toHaveText(/^[A-Z2-7]{5}-[A-Z2-7]{5}$/);

  await page.getByRole("link", { name: "Я сохранил коды" }).click();
  await expect(page).toHaveURL(`${urls.crm}/clients`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("CRM: the Подтвердить button submits a code typed digit by digit", async ({ page }) => {
  await page.goto(`${urls.crm}/login`);
  await submitPassword(page, users.manager.login);
  await expect(page.getByRole("heading", { name: "Введите код" })).toBeVisible();

  const confirm = page.getByRole("button", { name: "Подтвердить" });
  await expect(confirm).toBeVisible();
  await confirm.click();
  await expect(page.getByText("Введите все шесть цифр кода.")).toBeVisible();

  await page.getByLabel("Цифра 1 из 6").fill(twoFactorMockCode);
  await expect(page).toHaveURL(`${urls.crm}/`);
});

test("Back Office: a manager with a valid password and code is refused", async ({ page }) => {
  await page.goto(`${urls.backoffice}/login`);
  await submitPassword(page, users.manager.login);
  await enterTwoFactorCode(page, twoFactorMockCode);
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Для входа в back office требуются права администратора." }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});
