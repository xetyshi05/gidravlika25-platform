import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { urls } from "../environment.mjs";
import { customer, users } from "../fixtures/data.mjs";
import { signIn } from "../support/helpers";

test("CRM: reissued recovery codes are shown once and logout ends the session", async ({
  page,
}) => {
  await signIn(page, urls.crm, users.manager.login);

  await page.getByRole("button", { name: "Перевыпустить резервные коды" }).click();
  const dialog = page.getByRole("dialog", { name: "Резервные коды" });
  await dialog.getByRole("button", { name: "Перевыпустить" }).click();
  const codes = dialog.locator("code");
  await expect(codes).toHaveCount(8);
  await expect(codes.first()).toHaveText(/^[A-Z2-7]{5}-[A-Z2-7]{5}$/);
  await dialog.getByRole("button", { name: "Я сохранил коды" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: "Выйти из CRM" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto(`${urls.crm}/requests`);
  await expect(page).toHaveURL(/\/login\?next=%2Frequests/);
});

test("CRM: an administrator downloads the personal data export of a customer", async ({ page }) => {
  await signIn(page, urls.crm, users.admin.login);
  await page.goto(`${urls.crm}/clients/${customer.id}`);

  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Экспорт данных" }).click();
  const file = await (await download).path();
  const exported = JSON.parse(await readFile(file, "utf8")) as {
    exportedAt: string;
    customer: { id: string; lastName: string; requests: unknown[] };
  };

  expect(Date.parse(exported.exportedAt)).not.toBeNaN();
  expect(exported.customer.id).toBe(customer.id);
  expect(exported.customer.lastName).toBe(customer.lastName);
  expect(exported.customer.requests.length).toBeGreaterThan(0);
});
