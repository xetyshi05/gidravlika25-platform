import { expect, test, type Page } from "@playwright/test";
import { urls } from "../environment.mjs";
import { products, users } from "../fixtures/data.mjs";
import { productPhotoPng, signIn } from "../support/helpers";

test.beforeEach(async ({ page }) => {
  await signIn(page, urls.backoffice, users.admin.login);
  await page.goto(`${urls.backoffice}/products`);
});

test("publishing a product in the Back Office shows it on the site", async ({ page, request }) => {
  const productUrl = `${urls.web}/catalog/${products.draft.slug}`;
  const site = await page.context().newPage();
  await site.goto(productUrl);
  await expect(site.getByRole("heading", { level: 1, name: "Страница не найдена" })).toBeVisible();

  const dialog = await openProduct(page, products.draft.name);
  const active = dialog.getByRole("switch", { name: "Товар активен" });
  await expect(active).toHaveAttribute("aria-checked", "false");
  await active.click();
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("Товар сохранён")).toBeVisible();

  // The API revalidates the catalog cache of the site after the commit.
  await expect
    .poll(async () => (await request.get(productUrl)).text(), { timeout: 15_000 })
    .toContain(products.draft.name);
  await site.reload();
  await expect(site.getByRole("heading", { level: 1, name: products.draft.name })).toBeVisible();
});

test("a product photo goes through background removal and is published to S3", async ({
  page,
  request,
}) => {
  const dialog = await openProduct(page, products.photo.name);
  await dialog.getByRole("button", { name: "Выбрать новое фото" }).click();

  const editor = page.getByRole("dialog", { name: "Новое фото товара" });
  await editor.locator('input[type="file"]').setInputFiles({
    name: "cylinder.png",
    mimeType: "image/png",
    buffer: productPhotoPng(),
  });
  await editor.getByRole("button", { name: "Далее" }).click();
  await expect(editor.getByText("После обработки")).toBeVisible();
  await editor.getByRole("button", { name: "Сохранить фото" }).click();

  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("Товар сохранён")).toBeVisible();

  // The new WebP lives under the product's own key and is served by the bucket.
  const catalog = await request.get(`${urls.api}/catalog/products/${products.photo.slug}`);
  expect(catalog.ok()).toBe(true);
  const { imagePath } = (await catalog.json()) as { imagePath: string | null };
  expect(imagePath).toMatch(
    new RegExp(`^${urls.s3}/gidravlika-e2e/catalog/${products.photo.id}/[\\w-]+\\.webp$`),
  );
  const image = await request.get(imagePath!);
  expect(image.ok()).toBe(true);
  expect(image.headers()["content-type"]).toBe("image/webp");
});

async function openProduct(page: Page, name: string) {
  await page.getByRole("button", { name: `Открыть товар «${name}»` }).click();
  const dialog = page.getByRole("dialog", { name: "Редактирование товара" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("a stock change in the Back Office reaches the catalog", async ({ page, request }) => {
  await page.goto(`${urls.backoffice}/stock`);
  await page.getByRole("button", { name: `Добавить ${products.photo.name}` }).click();

  await expect
    .poll(async () => {
      const response = await request.get(`${urls.api}/catalog/products/${products.photo.slug}`);
      return ((await response.json()) as { stockQuantity: number }).stockQuantity;
    })
    .toBe(products.photo.stockQuantity + 1);
});
