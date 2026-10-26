export const DEFAULT_PERSONAL_DATA_DOCUMENT_VERSION = '2026-09-08';

// SHA-256 of the versioned privacy policy and personal-data consent text
// published for DEFAULT_PERSONAL_DATA_DOCUMENT_VERSION.
export const DEFAULT_PERSONAL_DATA_DOCUMENT_HASH =
  '7a4ac553b3b5f4f7fbaee6018215e87d1883598727cbd555123a2227c0fb48ea';

export type ActivePersonalDataDocument = {
  version: string;
  hash: string;
};

export function getActivePersonalDataDocument(): ActivePersonalDataDocument {
  return {
    version:
      process.env.PERSONAL_DATA_DOCUMENT_VERSION?.trim() || DEFAULT_PERSONAL_DATA_DOCUMENT_VERSION,
    hash:
      process.env.PERSONAL_DATA_DOCUMENT_HASH?.trim().toLowerCase() ||
      DEFAULT_PERSONAL_DATA_DOCUMENT_HASH,
  };
}
