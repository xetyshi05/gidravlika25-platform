export declare const requestTypes: readonly ["CART", "CUSTOM", "WHOLESALE"];
export type RequestType = (typeof requestTypes)[number];

export declare const requestStatuses: readonly [
  "NEW",
  "IN_PROGRESS",
  "CONTACTED",
  "COMPLETED",
  "CANCELLED",
];
export type RequestStatus = (typeof requestStatuses)[number];

export declare const requestTypeLabels: Readonly<Record<RequestType, string>>;
export declare const requestStatusLabels: Readonly<Record<RequestStatus, string>>;
