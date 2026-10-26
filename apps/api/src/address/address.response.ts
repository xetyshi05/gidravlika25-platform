// Response bodies of /address (ARCH-01), described by the @nestjs/swagger plugin.

export class DeliveryAddressDetails {
  postalCode!: string | null;
  region!: string | null;
  area!: string | null;
  city!: string | null;
  settlement!: string | null;
  street!: string | null;
  house!: string | null;
  block!: string | null;
  flat!: string | null;
}

export class AddressSuggestion {
  value!: string;
  unrestrictedValue!: string;
  details!: DeliveryAddressDetails;
}
