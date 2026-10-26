export function normalizePhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) return `+7${digits.slice(1)}`;
  if (digits.length === 11 && digits.startsWith('7')) return `+${digits}`;
  if (digits.length === 10) return `+7${digits}`;
  return null;
}

export function normalizeEmail(email: string | null | undefined): string | undefined {
  const value = email?.trim().toLowerCase();
  return value || undefined;
}
