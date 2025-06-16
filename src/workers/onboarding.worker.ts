// src/workers/onboarding.worker.ts

import prisma from '@/lib/prisma/client';
import { Job } from 'bullmq';

export const processOnboardingBonus = async (job: Job) => {
  const { userId } = job.data;
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
        await tx.userAchievement.createMany({
          data: [{ userId, achievementId: welcomeAchievement.id }],
          skipDuplicates: true
        });
      }
    });
    // TODO: Send welcome email to user
  } catch (error) {
    console.error(`[Worker] Failed to process onboarding bonus for user ${userId}:`, error);
    throw error;
  }
};
