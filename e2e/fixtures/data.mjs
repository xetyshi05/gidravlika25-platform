// Seed data of the browser E2E stand. Test-only credentials of a throwaway local
// database; 2FA runs in mock mode and accepts `twoFactorMockCode`.
export const password = "e2e-Password-2026";

export const users = {
  admin: { id: "e2e-user-admin", login: "e2e-admin", name: "Админ Тестов", role: "ADMIN" },
  manager: {
    id: "e2e-user-manager",
    login: "e2e-manager",
    name: "Менеджер Тестов",
    role: "MANAGER",
  },
  // No authenticator yet: the first login goes through the 2FA setup.
  newcomer: {
    id: "e2e-user-newcomer",
    login: "e2e-newcomer",
    name: "Новичок Тестов",
    role: "MANAGER",
    setupRequired: true,
  },
};

export const category = { id: "e2e-category", name: "Гидроцилиндры E2E", slug: "e2e-cylinders" };

export const products = {
  // In stock and published: added to the cart on the public site.
  inStock: {
    id: "e2e-product-stock",
    sku: "E2E-1001",
    name: "Гидроцилиндр E2E ЦГ-50",
    slug: "e2e-cylinder-50",
    price: "12500.00",
    stockQuantity: 10,
    isActive: true,
  },
  // Hidden until an administrator publishes it in the Back Office.
  draft: {
    id: "e2e-product-draft",
    sku: "E2E-1002",
    name: "Гидроцилиндр E2E ЦГ-63 черновик",
    slug: "e2e-cylinder-63-draft",
    price: "18900.00",
    stockQuantity: 4,
    isActive: false,
  },
  // Gets a photo through the Back Office image pipeline.
  photo: {
    id: "e2e-product-photo",
    sku: "E2E-1003",
    name: "Гидроцилиндр E2E ЦГ-80 для фото",
    slug: "e2e-cylinder-80-photo",
    price: "24300.00",
    stockQuantity: 2,
    isActive: true,
  },
};

// Edited from two CRM sessions at once (409).
export const customer = {
  id: "e2e-customer-conflict",
  firstName: "Пётр",
  lastName: "Конфликтов",
  middleName: "Ильич",
  phone: "+7 (900) 000-00-01",
  normalizedPhone: "+79000000001",
};

// A custom-production request of that customer, opened by the accessibility checks.
export const customRequest = {
  id: "e2e-request-custom",
  comment: "Нужен гидроцилиндр по чертежу, 2 шт.",
};
