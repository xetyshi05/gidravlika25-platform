import { expect, test, type Browser } from "@playwright/test";
import { urls } from "../environment.mjs";
import { customer, users } from "../fixtures/data.mjs";
import { signIn } from "../support/helpers";

test("CRM: saving a customer card changed in another session answers 409 and offers a refresh", async ({
  browser,
}) => {
  const first = await openCustomerEditor(browser, users.admin.login);
  const second = await openCustomerEditor(browser, users.manager.login);

  await first.dialog.getByRole("textbox", { name: "Компания" }).fill("ООО «Первый»");
  await first.dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(
    first.dialog.getByRole("status").filter({ hasText: "Данные клиента сохранены." }),
  ).toBeVisible();

  // The second editor still holds the version it was opened with.
  await second.dialog.getByRole("textbox", { name: "Компания" }).fill("ООО «Второй»");
  await second.dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(
    second.dialog
      .getByRole("alert")
      .filter({ hasText: "Карточка клиента уже изменена другим пользователем" }),
  ).toBeVisible();

  await second.dialog.getByRole("button", { name: "Обновить данные" }).click();
  const company = second.dialog.getByRole("textbox", { name: "Компания" });
  await expect(company).toHaveValue("ООО «Первый»");
  await company.fill("ООО «Второй»");
  await second.dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(
    second.dialog.getByRole("status").filter({ hasText: "Данные клиента сохранены." }),
  ).toBeVisible();

  await first.context.close();
  await second.context.close();
});

async function openCustomerEditor(browser: Browser, login: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, urls.crm, login);
  await page.goto(`${urls.crm}/clients/${customer.id}`);
  await page.getByRole("button", { name: "Редактировать" }).click();
  const dialog = page.getByRole("dialog", { name: "Редактирование клиента" });
  await expect(dialog).toBeVisible();
  return { context, dialog };
}
