-- DATA-05: children of a category (tree checks, deletion) and the Back Office
-- journal filtered by action were full scans.
CREATE INDEX "Category_parentId_idx" ON "Category"("parentId");

CREATE INDEX "BackofficeActivity_action_createdAt_idx" ON "BackofficeActivity"("action", "createdAt" DESC);
