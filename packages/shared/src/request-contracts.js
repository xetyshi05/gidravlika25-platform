export const requestTypes = Object.freeze(["CART", "CUSTOM", "WHOLESALE"]);

export const requestStatuses = Object.freeze([
  "NEW",
  "IN_PROGRESS",
  "CONTACTED",
  "COMPLETED",
  "CANCELLED",
]);

export const requestTypeLabels = Object.freeze({
  CART: "Из корзины",
  CUSTOM: "Изготовление на заказ",
  WHOLESALE: "Оптовая закупка",
});

export const requestStatusLabels = Object.freeze({
  NEW: "Новая",
  IN_PROGRESS: "В работе",
  CONTACTED: "Связались",
  COMPLETED: "Завершена",
  CANCELLED: "Отменена",
});
