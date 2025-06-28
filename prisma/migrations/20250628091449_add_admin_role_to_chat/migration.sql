-- CreateEnum
CREATE TYPE "ChatRoomMemberRole" AS ENUM ('ADMIN', 'MEMBER');

-- AlterTable
ALTER TABLE "ChatRoomMember" ADD COLUMN     "role" "ChatRoomMemberRole" NOT NULL DEFAULT 'MEMBER';
