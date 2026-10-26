import type { components } from "@gidravlika25/api-contract";

// Bodies of /customers, generated from the API's OpenAPI contract (ARCH-01).
type Schemas = components["schemas"];
export type CustomerSummary = Schemas["CustomerSummary"];
export type CustomersPage = Schemas["CustomerList"];
export type CustomerDetails = Schemas["CustomerDetails"];
export type CustomerActivity = Schemas["CustomerActivity"];
export type CustomerDuplicate = Schemas["CustomerDuplicate"];
export type CustomerConsent = Schemas["CustomerConsent"];
export type CustomerRequest = Schemas["CustomerRequest"];
