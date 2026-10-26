import { expect, test, type Page } from "@playwright/test";
import { urls } from "../environment.mjs";
import { products, users } from "../fixtures/data.mjs";
import { signIn } from "../support/helpers";

test("a cart request from the site reaches the CRM, changes status and gets a comment", async ({
  page,
  browser,
}) => {
  const requestNumber = await submitCartRequest(page);

  const crm = await browser.newContext();
  const manager = await crm.newPage();
  await signIn(manager, urls.crm, users.manager.login);
  await manager.goto(`${urls.crm}/requests`);
  await manager.getByRole("link", { name: new RegExp(`№ ${requestNumber}\\b`) }).click();
  await expect(
    manager.getByRole("heading", { level: 1, name: `Заявка № ${requestNumber}` }),
  ).toBeVisible();
  await expect(manager.getByText(products.inStock.sku, { exact: true })).toBeVisible();
  await expect(manager.getByText("Кузнецов Иван Петрович").first()).toBeVisible();

  await manager.getByRole("button", { name: "В работе" }).click();
  const confirmation = manager.getByRole("dialog", { name: "Подтвердите действие" });
  await expect(confirmation).toContainText("«В работе»");
  await confirmation.getByRole("button", { name: "Подтвердить" }).click();
  // The controls re-render for the new status and offer the next step.
  await expect(manager.getByRole("button", { name: "Связались" })).toBeVisible();
  await expect(
    manager.getByRole("listitem").filter({ hasText: "Статус изменён на" }),
  ).toContainText("В работе");

  const comment = `Перезвонить после обеда (${requestNumber})`;
  await manager.getByLabel("Комментарий").fill(comment);
  await manager.getByRole("button", { name: "Добавить комментарий" }).click();
  await expect(
    manager.getByRole("status").filter({ hasText: "Комментарий добавлен." }),
  ).toBeVisible();
  await expect(manager.locator("article").filter({ hasText: comment })).toContainText(
    users.manager.name,
  );
  await expect(
    manager.getByRole("listitem").filter({ hasText: "Добавлен внутренний комментарий" }),
  ).toContainText(comment);
  await crm.close();
});

test("the success screen announces the request number at once (WEB-08)", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await submitCartRequest(page);
  await expect(page.getByRole("link", { name: "Вернуться в каталог" })).toBeVisible();
});

/** Adds the in-stock product to the cart and sends the request with pickup. */
async function submitCartRequest(page: Page) {
  await page.goto(`${urls.web}/catalog/${products.inStock.slug}`);
  await expect(page.getByRole("heading", { level: 1, name: products.inStock.name })).toBeVisible();
  await page.getByRole("button", { name: "Только необходимые" }).click();
  await page.getByRole("button", { name: "Добавить в корзину" }).click();
  await page.goto(`${urls.web}/cart`);
  await expect(page.getByText(products.inStock.name).first()).toBeVisible();
  await page.getByRole("link", { name: "Оформить заявку" }).click();

  const field = (name: string) => page.getByRole("textbox", { name, exact: true });
  await field("Фамилия").fill("Кузнецов");
  await field("Имя").fill("Иван");
  await field("Отчество").fill("Петрович");
  await field("Номер телефона").pressSequentially("9001234567");
  await field("Почта").fill("ivan.kuznetsov@example.test");
  const next = page.getByRole("button", { name: "Продолжить" });
  await next.click(); // delivery: pickup is preselected
  await next.click(); // payment: bank transfer is preselected
  await next.click(); // review
  await expect(page.getByText("Кузнецов Иван Петрович")).toBeVisible();
  await page.getByRole("checkbox", { name: /согласие на обработку персональных данных/ }).check();
  await page.getByRole("button", { name: "Оформить заявку" }).click();

  // WEB-08: the heading with the number takes focus immediately and the status
  // message is in the accessibility tree while the animation still runs.
  const heading = page.getByRole("heading", { level: 1, name: /^Заявка № \d+/ });
  await expect(heading).toBeFocused();
  await expect(page.getByRole("status").filter({ hasText: "Заявка принята." })).toBeAttached();
  const number = (await heading.textContent())?.match(/\d+/)?.[0];
  expect(number).toBeTruthy();
  return number!;
}
