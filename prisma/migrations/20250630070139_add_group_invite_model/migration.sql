-- CreateTable
CREATE TABLE "GroupInvite" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "chatRoomId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedById" TEXT,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "GroupInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GroupInvite_code_key" ON "GroupInvite"("code");

-- CreateIndex
CREATE INDEX "GroupInvite_chatRoomId_idx" ON "GroupInvite"("chatRoomId");

-- CreateIndex
CREATE INDEX "GroupInvite_adminId_idx" ON "GroupInvite"("adminId");

-- AddForeignKey
ALTER TABLE "GroupInvite" ADD CONSTRAINT "GroupInvite_chatRoomId_fkey" FOREIGN KEY ("chatRoomId") REFERENCES "ChatRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupInvite" ADD CONSTRAINT "GroupInvite_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "UserProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupInvite" ADD CONSTRAINT "GroupInvite_usedById_fkey" FOREIGN KEY ("usedById") REFERENCES "UserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
