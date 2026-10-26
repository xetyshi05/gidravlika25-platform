-- CreateTable
CREATE TABLE "OperationHeartbeat" (
    "name" TEXT NOT NULL,
    "succeededAt" TIMESTAMP(3) NOT NULL,
    "details" JSONB,

    CONSTRAINT "OperationHeartbeat_pkey" PRIMARY KEY ("name")
);
