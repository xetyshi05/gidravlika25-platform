// Response bodies of /auth (ARCH-01), described by the @nestjs/swagger plugin.
import type { UserRole } from '@prisma/client';

export class BootstrapStatus {
  setupAvailable!: boolean;
  setupSecretConfigured!: boolean;
}

/** Password accepted: the second factor is required next. */
export class TwoFactorRequired {
  twoFactorRequired!: boolean;
  setupRequired!: boolean;
  challengeToken!: string;
  expiresAt!: Date;
}

/** Authenticator enrolment data of a SETUP challenge. */
export class TwoFactorSetup {
  type!: string;
  otpAuthUrl!: string;
  qrDataUrl!: string;
  manualKey!: string;
  expiresAt!: Date;
}

export class AuthSession {
  token!: string;
  expiresAt!: Date;
  /** Only right after the 2FA setup: shown to the user once. */
  recoveryCodes?: string[];
}

export class CurrentUser {
  id!: string;
  name!: string;
  login!: string;
  role!: UserRole;
}

export class RecoveryCodes {
  recoveryCodes!: string[];
}

export class OkResult {
  ok!: boolean;
}
