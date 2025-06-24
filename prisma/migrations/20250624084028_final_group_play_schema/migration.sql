-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "GameStatus" ADD VALUE 'LOBBY';
ALTER TYPE "GameStatus" ADD VALUE 'READY_COUNTDOWN';

-- AlterTable
ALTER TABLE "GameSession" ADD COLUMN     "countdownStartTime" TIMESTAMP(3),
ADD COLUMN     "difficulty" "Difficulty",
ADD COLUMN     "durationMinutes" INTEGER,
ADD COLUMN     "hostId" TEXT,
ADD COLUMN     "maxPlayers" INTEGER,
ADD COLUMN     "minPlayers" INTEGER;
