ALTER TABLE "Request" ADD COLUMN "sequence" SERIAL NOT NULL;

CREATE UNIQUE INDEX "Request_sequence_key" ON "Request"("sequence");
