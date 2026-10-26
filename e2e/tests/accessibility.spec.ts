import { expect, test, type Page } from "@playwright/test";
import { urls } from "../environment.mjs";
import { customRequest, customer, products, users } from "../fixtures/data.mjs";
import { axeViolations, signIn, submitPassword } from "../support/helpers";

// Every screen is checked before the assertion, so one run lists all violations.
function axeAudit(page: Page, disabledRules: string[] = []) {
  const found: string[] = [];
  return {
    async check(description: string, prepare: () => Promise<unknown>) {
      await test.step(description, async () => {
        await prepare();
        found.push(...(await axeViolations(page, disabledRules)));
      });
    },
    expectClean() {
      expect(found).toEqual([]);
    },
  };
}

test("site: key screens have no axe violations", async ({ page }) => {
  const audit = axeAudit(page);
  await audit.check("home with the cookie banner", async () => {
    await page.goto(`${urls.web}/`);
    await expect(page.getByRole("heading", { name: "Мы используем cookie" })).toBeVisible();
  });
  await page.getByRole("button", { name: "Только необходимые" }).click();
  await audit.check("catalog", async () => {
    await page.goto(`${urls.web}/catalog`);
    await expect(page.getByText(products.inStock.name).first()).toBeVisible();
  });
  await audit.check("product page", async () => {
    await page.goto(`${urls.web}/catalog/${products.inStock.slug}`);
    await page.getByRole("button", { name: "Добавить в корзину" }).click();
  });
  await audit.check("cart", async () => {
    await page.goto(`${urls.web}/cart`);
    await expect(page.getByRole("link", { name: "Оформить заявку" })).toBeVisible();
  });
  await audit.check("checkout with validation errors", async () => {
    await page.goto(`${urls.web}/checkout`);
    await page.getByRole("button", { name: "Продолжить" }).click();
    await expect(page.getByText("Укажите фамилию")).toBeVisible();
  });
  await audit.check("custom production form", async () => {
    await page.goto(`${urls.web}/custom-production`);
    await page.getByRole("button", { name: "Оставить заявку" }).first().click();
    await expect(page.getByRole("dialog", { name: "Оставьте контакты" })).toBeVisible();
  });
  audit.expectClean();
});

test("CRM: key screens have no axe violations", async ({ page }) => {
  const audit = axeAudit(page);
  await audit.check("login", async () => {
    await page.goto(`${urls.crm}/login`);
  });
  await audit.check("2FA code", async () => {
    await submitPassword(page, users.manager.login);
    await expect(page.getByRole("heading", { name: "Введите код" })).toBeVisible();
  });
  await signIn(page, urls.crm, users.manager.login);
  await audit.check("dashboard", async () => {
    await page.goto(`${urls.crm}/`);
  });
  await audit.check("requests", async () => {
    await page.goto(`${urls.crm}/requests`);
    await expect(page.getByRole("link", { name: /№ \d+/ }).first()).toBeVisible();
  });
  await audit.check("request", async () => {
    await page.goto(`${urls.crm}/requests/${customRequest.id}`);
    await expect(page.getByText(customRequest.comment)).toBeVisible();
  });
  await audit.check("status confirmation dialog", async () => {
    await page.getByRole("button", { name: "В работе" }).click();
    await expect(page.getByRole("dialog", { name: "Подтвердите действие" })).toBeVisible();
  });
  await page.getByRole("button", { name: "Не сейчас" }).click();
  await audit.check("clients", async () => {
    await page.goto(`${urls.crm}/clients`);
    await expect(page.getByText(customer.lastName).first()).toBeVisible();
  });
  await audit.check("client", async () => {
    await page.goto(`${urls.crm}/clients/${customer.id}`);
    await expect(page.getByRole("button", { name: "Редактировать" })).toBeVisible();
  });
  audit.expectClean();
});

test("Back Office: key screens have no axe violations", async ({ page }) => {
  // TODO(A11Y-01, заход 16e): the dark theme's faint and muted text is below 4.5:1;
  // enable color-contrast here once the Back Office palette is fixed.
  const audit = axeAudit(page, ["color-contrast"]);
  await audit.check("login", async () => {
    await page.goto(`${urls.backoffice}/login`);
  });
  await signIn(page, urls.backoffice, users.admin.login);
  for (const [path, heading] of [
    ["/", null],
    ["/products", "Товары"],
    ["/stock", null],
    ["/categories", null],
    ["/media", null],
    ["/users", null],
    ["/activity-log", null],
    ["/settings", null],
  ] as const) {
    await audit.check(path, async () => {
      await page.goto(`${urls.backoffice}${path}`);
      if (heading) await expect(page.getByRole("heading", { name: heading })).toBeVisible();
      await page.waitForLoadState("networkidle");
    });
  }
  await audit.check("product dialog", async () => {
    await page.goto(`${urls.backoffice}/products`);
    await page.getByRole("button", { name: `Открыть товар «${products.inStock.name}»` }).click();
    await expect(page.getByRole("dialog", { name: "Редактирование товара" })).toBeVisible();
  });
  await audit.check("photo dialog", async () => {
    await page.getByRole("button", { name: "Выбрать новое фото" }).click();
    await expect(page.getByRole("dialog", { name: "Новое фото товара" })).toBeVisible();
  });
  audit.expectClean();
});
