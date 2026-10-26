import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError, actionError, apiErrorFrom } from "./api-error.ts";

test("keeps the user-facing message of a client error", () => {
  const error = apiErrorFrom(400, {
    statusCode: 400,
    message: "Комментарий не может быть пустым.",
  });
  assert.equal(error.status, 400);
  assert.deepEqual(actionError(error, "Не удалось."), {
    error: "Комментарий не может быть пустым.",
  });
});

test("marks a 409 as a conflict so the page can offer a refresh", () => {
  const error = apiErrorFrom(409, {
    statusCode: 409,
    message: "Статус заявки уже изменён другим пользователем. Обновите страницу.",
  });
  assert.deepEqual(actionError(error, "Не удалось."), {
    error: "Статус заявки уже изменён другим пользователем. Обновите страницу.",
    conflict: true,
  });
  assert.deepEqual(actionError(new ApiError(409), "Не удалось."), {
    error: "Данные уже изменены другим пользователем.",
    conflict: true,
  });
});

test("never exposes validation arrays, server errors or unreadable bodies", () => {
  const validation = apiErrorFrom(400, { statusCode: 400, message: ["email must be an email"] });
  assert.deepEqual(actionError(validation, "Проверьте поля."), { error: "Проверьте поля." });
  const server = apiErrorFrom(500, { message: "Внутренняя ошибка сервера." });
  assert.deepEqual(actionError(server, "Не удалось."), { error: "Не удалось." });
  const html = apiErrorFrom(404, "<html>not found</html>");
  assert.deepEqual(actionError(html, "Не удалось."), { error: "Не удалось." });
  assert.deepEqual(actionError(new Error("boom"), "Не удалось."), { error: "Не удалось." });
});

test("explains an expired session and a timeout", () => {
  assert.deepEqual(actionError(new ApiError(401, "Требуется авторизация."), "Не удалось."), {
    error: "Сессия истекла. Войдите в CRM заново.",
  });
  assert.equal(
    actionError(new ApiError(504), "Не удалось.").error,
    "API не ответил вовремя. Повторите запрос.",
  );
});
