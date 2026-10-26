import { crc32, deflateSync } from "node:zlib";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { twoFactorMockCode } from "../environment.mjs";
import { password } from "../fixtures/data.mjs";

/** Password and the mock 2FA code on the CRM or Back Office login page. */
export async function signIn(page: Page, baseUrl: string, login: string) {
  await page.goto(`${baseUrl}/login`);
  await submitPassword(page, login);
  await enterTwoFactorCode(page, twoFactorMockCode);
  await expect(page).not.toHaveURL(/\/login/);
}

export async function submitPassword(page: Page, login: string) {
  await page.getByLabel("Логин").fill(login);
  await page.getByLabel("Пароль", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Продолжить" }).click();
}

/** Six digits at once: the input spreads them over the fields and submits itself. */
export async function enterTwoFactorCode(page: Page, code: string) {
  await page.getByLabel("Цифра 1 из 6").fill(code);
}

/** WCAG 2.1 A/AA violations found by axe-core on the current page state. */
export async function axeViolations(page: Page, disabledRules: string[] = []) {
  // A dialog that is still fading in would be measured with blended colours.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => Number.isFinite(animation.effect?.getComputedTiming().endTime))
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .disableRules(disabledRules)
    .analyze();
  const path = new URL(page.url()).pathname;
  return results.violations.map(
    (violation) =>
      `${path}: ${violation.id} (${violation.impact}) ${violation.help} — ${violation.nodes
        .map((node) => node.target.join(" "))
        .join(", ")}`,
  );
}

/** A small opaque square on a transparent background, like a product photo without its background. */
export function productPhotoPng(size = 96) {
  const rows: Buffer[] = [];
  for (let y = 0; y < size; y += 1) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x += 1) {
      const inside = x >= size / 4 && x < (size * 3) / 4 && y >= size / 4 && y < (size * 3) / 4;
      row.set(inside ? [200, 30, 40, 255] : [0, 0, 0, 0], 1 + x * 4);
    }
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA, no interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(Buffer.concat(rows))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function pngChunk(type: string, data: Buffer) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}
