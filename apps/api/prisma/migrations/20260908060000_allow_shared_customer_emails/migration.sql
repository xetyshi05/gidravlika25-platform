-- A corporate mailbox may legitimately belong to multiple people. Customer
-- identity is enforced by normalizedPhone; normalizedEmail remains indexed so
-- CRM can suggest possible duplicates for manual review.
DROP INDEX IF EXISTS "Customer_normalizedEmail_key";

CREATE INDEX "Customer_normalizedEmail_idx"
ON "Customer"("normalizedEmail");
