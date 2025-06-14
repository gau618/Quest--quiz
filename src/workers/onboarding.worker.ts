import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

const prisma = new PrismaClient();

export const processOnboardingBonus = async (job: Job) => {
  const { userId } = job.data;
  console.log(`[Worker] Processing job ${job.id} for user: ${userId}`);

  try {
    const XP_BONUS = 100;
    const ACHIEVEMENT_TITLE = "Welcome Aboard!";

    await prisma.$transaction(async (tx) => {
      await tx.userProfile.update({
        where: { userId },
        data: { xp: { increment: XP_BONUS } },
      });

      const welcomeAchievement = await tx.achievement.findUnique({
        where: { title: ACHIEVEMENT_TITLE },
      });

      if (welcomeAchievement) {
        // Use createMany with skipDuplicates to prevent errors if the user already has the achievement
        await tx.userAchievement.createMany({
          data: [{ userId, achievementId: welcomeAchievement.id }],
          skipDuplicates: true
        });
      } else {
        console.warn(`[Worker] Achievement '${ACHIEVEMENT_TITLE}' not found.`);
      }
    });
    
    console.log(`[Worker] TODO: Send welcome email to user ${userId}`);
    console.log(`[Worker] Successfully processed bonus for user: ${userId}`);
  } catch (error) {
    console.error(`[Worker] Failed to process job ${job.id} for user ${userId}:`, error);
    throw error;
  }
};
