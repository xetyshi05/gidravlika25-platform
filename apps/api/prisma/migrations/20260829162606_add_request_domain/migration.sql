-- CreateEnum
CREATE TYPE "RequestType" AS ENUM ('CART', 'CUSTOM', 'WHOLESALE');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'CONTACTED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryType" AS ENUM ('PICKUP', 'DELIVERY');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('BANK_TRANSFER', 'ON_RECEIPT');

-- CreateEnum
CREATE TYPE "RequestActivityType" AS ENUM ('REQUEST_CREATED', 'STATUS_CHANGED', 'MANAGER_ASSIGNED', 'COMMENT_ADDED');

-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('PERSONAL_DATA');

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "middleName" TEXT,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "company" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Request" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "type" "RequestType" NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'NEW',
    "customerId" TEXT,
    "assignedManagerId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "middleName" TEXT,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "company" TEXT,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartRequest" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "deliveryType" "DeliveryType" NOT NULL,
    "paymentType" "PaymentType" NOT NULL,
    "deliveryAddress" TEXT,

    CONSTRAINT "CartRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartRequestItem" (
    "id" TEXT NOT NULL,
    "cartRequestId" TEXT NOT NULL,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "CartRequestItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomRequest" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "pistonDiameterMm" INTEGER NOT NULL,
    "rodDiameterMm" INTEGER NOT NULL,
    "strokeMm" INTEGER NOT NULL,
    "collapsedLengthMm" INTEGER NOT NULL,
    "maxPressureMpa" DECIMAL(6,2) NOT NULL,
    "nominalPressureMpa" DECIMAL(6,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "technicalComment" TEXT,

    CONSTRAINT "CustomRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WholesaleRequest" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "message" TEXT,

    CONSTRAINT "WholesaleRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestComment" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "authorId" TEXT,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequestComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestActivity" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "userId" TEXT,
    "type" "RequestActivityType" NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consent" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "type" "ConsentType" NOT NULL,
    "documentVersion" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Consent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Customer_phone_idx" ON "Customer"("phone");

-- CreateIndex
CREATE INDEX "Customer_email_idx" ON "Customer"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Request_number_key" ON "Request"("number");

-- CreateIndex
CREATE INDEX "Request_type_idx" ON "Request"("type");

-- CreateIndex
CREATE INDEX "Request_status_idx" ON "Request"("status");

-- CreateIndex
CREATE INDEX "Request_createdAt_idx" ON "Request"("createdAt");

-- CreateIndex
CREATE INDEX "Request_customerId_idx" ON "Request"("customerId");

-- CreateIndex
CREATE INDEX "Request_assignedManagerId_idx" ON "Request"("assignedManagerId");

-- CreateIndex
CREATE UNIQUE INDEX "CartRequest_requestId_key" ON "CartRequest"("requestId");

-- CreateIndex
CREATE INDEX "CartRequestItem_cartRequestId_idx" ON "CartRequestItem"("cartRequestId");

-- CreateIndex
CREATE INDEX "CartRequestItem_productId_idx" ON "CartRequestItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomRequest_requestId_key" ON "CustomRequest"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "WholesaleRequest_requestId_key" ON "WholesaleRequest"("requestId");

-- CreateIndex
CREATE INDEX "RequestComment_requestId_createdAt_idx" ON "RequestComment"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "RequestComment_authorId_idx" ON "RequestComment"("authorId");

-- CreateIndex
CREATE INDEX "RequestActivity_requestId_createdAt_idx" ON "RequestActivity"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "RequestActivity_userId_idx" ON "RequestActivity"("userId");

-- CreateIndex
CREATE INDEX "Consent_requestId_idx" ON "Consent"("requestId");

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartRequest" ADD CONSTRAINT "CartRequest_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartRequestItem" ADD CONSTRAINT "CartRequestItem_cartRequestId_fkey" FOREIGN KEY ("cartRequestId") REFERENCES "CartRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartRequestItem" ADD CONSTRAINT "CartRequestItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomRequest" ADD CONSTRAINT "CustomRequest_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WholesaleRequest" ADD CONSTRAINT "WholesaleRequest_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestComment" ADD CONSTRAINT "RequestComment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestActivity" ADD CONSTRAINT "RequestActivity_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
