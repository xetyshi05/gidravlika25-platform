// Response bodies of /customers (ARCH-01), described by the @nestjs/swagger plugin.
import type {
  ConsentSource,
  ConsentType,
  CustomerActivityType,
  DeliveryType,
  PaymentType,
  Prisma,
  RequestActivityType,
  RequestStatus,
  RequestType,
} from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import { DecimalString, JsonObject } from '../openapi/api-property';
import {
  CustomRequestDetails,
  Pagination,
  StoredDeliveryAddressDetails,
  UserReference,
  WholesaleRequestDetails,
} from '../requests/requests.response';

export class CustomerSummary {
  id!: string;
  firstName!: string;
  lastName!: string;
  middleName!: string | null;
  phone!: string;
  email!: string | null;
  company!: string | null;
  anonymizedAt!: Date | null;
  createdAt!: Date;
  updatedAt!: Date;
  requestCount!: number;
  lastActivity!: Date | null;
}

export class CustomerList {
  data!: CustomerSummary[];
  pagination!: Pagination;
}

export class CustomerRequest {
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
  createdAt!: Date;
  updatedAt!: Date;
}

export class CustomerActivity {
  id!: string;
  customerId!: string;
  userId!: string | null;
  user!: UserReference | null;
  type!: CustomerActivityType;
  @JsonObject({ nullable: true }) data!: Prisma.JsonValue;
  createdAt!: Date;
}

export class CustomerDuplicate {
  id!: string;
  firstName!: string;
  lastName!: string;
  middleName!: string | null;
  phone!: string;
  email!: string | null;
  company!: string | null;
  anonymizedAt!: Date | null;
  requestCount!: number;
}

export class ConsentRequestReference {
  id!: string;
  number!: string;
  type!: RequestType;
}

export class CustomerConsent {
  id!: string;
  type!: ConsentType;
  documentVersion!: string;
  documentHash!: string;
  source!: ConsentSource;
  acceptedAt!: Date;
  request!: ConsentRequestReference;
}

export class CustomerDetails {
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
  createdAt!: Date;
  updatedAt!: Date;
  requestCount!: number;
  requests!: CustomerRequest[];
  requestsPagination!: Pagination;
  activities!: CustomerActivity[];
  potentialDuplicates!: CustomerDuplicate[];
  consents!: CustomerConsent[];
}

export class CustomerAnonymization {
  ok!: boolean;
  anonymizedAt!: Date;
  requestsAnonymized!: number;
}

// Personal data export (152-FZ): everything stored about the customer.

export class ExportedCustomerActivity {
  type!: CustomerActivityType;
  @JsonObject({ nullable: true }) data!: Prisma.JsonValue;
  createdAt!: Date;
}

export class ExportedRequestActivity {
  type!: RequestActivityType;
  @JsonObject({ nullable: true }) data!: Prisma.JsonValue;
  createdAt!: Date;
}

export class ExportedComment {
  text!: string;
  createdAt!: Date;
  updatedAt!: Date;
}

export class ExportedCartItem {
  productName!: string;
  sku!: string;
  @DecimalString() price!: Prisma.Decimal;
  quantity!: number;
  @DecimalString() total!: Prisma.Decimal;
}

export class ExportedCartRequest {
  @DecimalString() subtotal!: Prisma.Decimal;
  deliveryType!: DeliveryType;
  paymentType!: PaymentType;
  deliveryAddress!: string | null;
  @ApiProperty({ type: () => StoredDeliveryAddressDetails, nullable: true })
  deliveryAddressDetails!: Prisma.JsonValue;
  items!: ExportedCartItem[];
}

export class ExportedConsent {
  type!: ConsentType;
  documentVersion!: string;
  documentHash!: string;
  source!: ConsentSource;
  acceptedAt!: Date;
}

export class ExportedRequest {
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
  comment!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
  cartRequest!: ExportedCartRequest | null;
  customRequest!: CustomRequestDetails | null;
  wholesaleRequest!: WholesaleRequestDetails | null;
  comments!: ExportedComment[];
  activities!: ExportedRequestActivity[];
  consents!: ExportedConsent[];
}

export class ExportedCustomer {
  id!: string;
  firstName!: string;
  lastName!: string;
  middleName!: string | null;
  phone!: string;
  email!: string | null;
  company!: string | null;
  anonymizedAt!: Date | null;
  createdAt!: Date;
  updatedAt!: Date;
  activities!: ExportedCustomerActivity[];
  requests!: ExportedRequest[];
}

export class CustomerPersonalDataExport {
  exportedAt!: Date;
  customer!: ExportedCustomer;
}
