-- CreateIndex
CREATE INDEX "Activity_dealId_idx" ON "Activity"("dealId");

-- CreateIndex
CREATE INDEX "Activity_clientId_idx" ON "Activity"("clientId");

-- CreateIndex
CREATE INDEX "Activity_ownerId_scheduledAt_idx" ON "Activity"("ownerId", "scheduledAt");

-- CreateIndex
CREATE INDEX "Activity_ownerId_doneAt_idx" ON "Activity"("ownerId", "doneAt");

-- CreateIndex
CREATE INDEX "Client_ownerId_createdAt_idx" ON "Client"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "Client_type_idx" ON "Client"("type");

-- CreateIndex
CREATE INDEX "Deal_clientId_idx" ON "Deal"("clientId");

-- CreateIndex
CREATE INDEX "Deal_stageId_idx" ON "Deal"("stageId");

-- CreateIndex
CREATE INDEX "Deal_ownerId_status_idx" ON "Deal"("ownerId", "status");

-- CreateIndex
CREATE INDEX "Deal_ownerId_status_closedAt_idx" ON "Deal"("ownerId", "status", "closedAt");

-- CreateIndex
CREATE INDEX "Deal_status_closedAt_idx" ON "Deal"("status", "closedAt");

-- CreateIndex
CREATE INDEX "Team_managerId_idx" ON "Team"("managerId");

-- CreateIndex
CREATE INDEX "User_teamId_idx" ON "User"("teamId");
