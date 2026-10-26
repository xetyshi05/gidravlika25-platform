import {
  requestStatuses,
  requestStatusLabels,
  requestTypeLabels,
  type RequestStatus,
  type RequestType,
} from "@gidravlika25/shared/request-contracts";
import type { components } from "@gidravlika25/api-contract";

export { requestStatuses, requestStatusLabels, requestTypeLabels };
export type { RequestStatus, RequestType };

// Bodies of /requests, generated from the API's OpenAPI contract (ARCH-01).
type Schemas = components["schemas"];
export type RequestSummary = Schemas["RequestSummary"];
export type Pagination = Schemas["Pagination"];
export type RequestHistoryPagination = Schemas["RequestHistoryPagination"];
export type RequestsPage = Schemas["RequestList"];
export type RequestStats = Schemas["RequestStats"];
export type CartRequestItem = Schemas["CartRequestItem"];
export type CartRequestDetails = Schemas["CartRequestDetails"];
export type RequestComment = Schemas["RequestComment"];
export type RequestActivity = Schemas["RequestActivity"];
export type RequestConsent = Schemas["RequestConsent"];
export type RequestDetails = Schemas["RequestDetails"];

/** Pages of the three history lists in the URL of a request. */
export type RequestHistoryPages = {
  commentsPage: number;
  activitiesPage: number;
  consentsPage: number;
};

// The labels in packages/shared must cover exactly the statuses and types of the API.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const statusesMatch: Same<RequestStatus, RequestSummary["status"]> = true;
const typesMatch: Same<RequestType, RequestSummary["type"]> = true;
void statusesMatch;
void typesMatch;
