// Response bodies of /requests (ARCH-01), described by the @nestjs/swagger plugin.
import type {
  ConsentSource,
  ConsentType,
  DeliveryType,
  PaymentType,
  Prisma,
  RequestActivityType,
  RequestStatus,
  RequestType,
} from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import { DecimalString, JsonObject } from '../openapi/api-property';

/** Public forms: the number shown to the visitor. */
export class PublicRequestReceipt {
  number!: string;
  createdAt!: Date;
}

export class Pagination {
  page!: number;
  limit!: number;
  total!: number;
  totalPages!: number;
}

export class RequestSummary {
  id!: string;
  number!: string;
  type!: RequestType;
  status!: RequestStatus;
  firstName!: string;
  lastName!: string;
  middleName!: string | null;
  phone!: string;
  email!: string | null;
  company!: string | null;
  responseDueAt!: Date;
  firstRespondedAt!: Date | null;
  createdAt!: Date;
  updatedAt!: Date;
  isUnread!: boolean;
  isSlaOverdue!: boolean;
  ageMinutes!: number;
}

export class RequestList {
  data!: RequestSummary[];
  pagination!: Pagination;
}

export class RequestStats {
  total!: number;
  new!: number;
  cart!: number;
  custom!: number;
  wholesale!: number;
  inProgress!: number;
  contacted!: number;
  completed!: number;
  cancelled!: number;
  unread!: number;
  overdue!: number;
}

export class RequestReadMark {
  readAt!: Date;
}

export class UserReference {
  id!: string;
  name!: string;
}

export class CartRequestItem {
  id!: string;
  cartRequestId!: string;
  productId!: string | null;
  legacyId!: number | null;
  productName!: string;
  sku!: string;
  @DecimalString() price!: Prisma.Decimal;
  quantity!: number;
  @DecimalString() total!: Prisma.Decimal;
  imagePath!: string | null;
}

/** The parts of a suggested address the visitor sent; only non-empty strings are stored. */
export class StoredDeliveryAddressDetails {
  postalCode?: string;
  region?: string;
  area?: string;
  city?: string;
  settlement?: string;
  street?: string;
  house?: string;
  block?: string;
  flat?: string;
}

export class CartRequestDetails {
  id!: string;
  requestId!: string;
  @DecimalString() subtotal!: Prisma.Decimal;
  deliveryType!: DeliveryType;
  paymentType!: PaymentType;
  deliveryAddress!: string | null;
  // A Json column in the database, written only by cleanAddressDetails().
  @ApiProperty({ type: () => StoredDeliveryAddressDetails, nullable: true })
  deliveryAddressDetails!: Prisma.JsonValue;
  items!: CartRequestItem[];
}

export class CustomRequestDetails {
  id!: string;
  requestId!: string;
  pistonDiameterMm!: number | null;
  rodDiameterMm!: number | null;
  strokeMm!: number | null;
  collapsedLengthMm!: number | null;
  @DecimalString({ nullable: true }) maxPressureMpa!: Prisma.Decimal | null;
  @DecimalString({ nullable: true }) nominalPressureMpa!: Prisma.Decimal | null;
  quantity!: number | null;
  technicalComment!: string | null;
}

export class WholesaleRequestDetails {
  id!: string;
  requestId!: string;
  message!: string | null;
}

export class RequestComment {
  id!: string;
  requestId!: string;
  authorId!: string | null;
  author!: UserReference | null;
  text!: string;
  createdAt!: Date;
  updatedAt!: Date;
}

export class RequestActivity {
  id!: string;
  requestId!: string;
  userId!: string | null;
  user!: UserReference | null;
  type!: RequestActivityType;
  @JsonObject({ nullable: true }) data!: Prisma.JsonValue;
  createdAt!: Date;
}

export class RequestConsent {
  id!: string;
  requestId!: string;
  type!: ConsentType;
  documentVersion!: string;
  documentHash!: string;
  source!: ConsentSource;
  acceptedAt!: Date;
}

export class RequestCustomer {
  id!: string;
  firstName!: string;
  lastName!: string;
  middleName!: string | null;
  phone!: string;
  normalizedPhone!: string | null;
  email!: string | null;
  normalizedEmail!: string | null;
  company!: string | null;
  anonymizedAt!: Date | null;
  lastRequestAt!: Date | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export class RequestHistoryPagination {
  comments!: Pagination;
  activities!: Pagination;
  consents!: Pagination;
}

export class RequestDetails {
  id!: string;
  sequence!: number;
  number!: string;
  type!: RequestType;
  status!: RequestStatus;
  customerId!: string | null;
  assignedManagerId!: string | null;
  firstName!: string;
  lastName!: string;
  middleName!: string | null;
  phone!: string;
  email!: string | null;
  company!: string | null;
  comment!: string | null;
  responseDueAt!: Date;
  firstRespondedAt!: Date | null;
  createdAt!: Date;
  updatedAt!: Date;
  isUnread!: boolean;
  isSlaOverdue!: boolean;
  ageMinutes!: number;
  customer!: RequestCustomer | null;
  cartRequest!: CartRequestDetails | null;
  customRequest!: CustomRequestDetails | null;
  wholesaleRequest!: WholesaleRequestDetails | null;
  comments!: RequestComment[];
  activities!: RequestActivity[];
  consents!: RequestConsent[];
  historyPagination!: RequestHistoryPagination;
}
