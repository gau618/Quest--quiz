// src/workers/onboarding.worker.ts

import prisma from '@/lib/prisma/client';
import { Job } from 'bullmq';
import { createWorker } from '@/lib/queue/config';

// Job processor function for 'onboarding-jobs'
export const processOnboardingBonus = async (job: Job) => {
  const { userId } = job.data;
  console.log(`[Worker][Onboarding] Processing onboarding bonus for user ${userId} (Job #${job.id}).`);
  try {
    const XP_BONUS = 100;
    const ACHIEVEMENT_TITLE = "Welcome Aboard!";

    await prisma.$transaction(async (tx) => {
      // Award XP bonus
      await tx.userProfile.update({
        where: { userId },
        data: { xp: { increment: XP_BONUS } },
      });
      console.log(`[Worker][Onboarding] Awarded ${XP_BONUS} XP to user ${userId}.`);

      // Ensure the "Welcome Aboard!" achievement exists, create if not
      const welcomeAchievement = await tx.achievement.upsert({
        where: { title: ACHIEVEMENT_TITLE },
        update: {}, // No updates if it exists
        create: {
          title: ACHIEVEMENT_TITLE,
          description: "Completed the initial onboarding process.",
          xp: XP_BONUS,
          // --- FIX: Provide a concrete string value for 'category' ---
          // You must define what category this achievement belongs to.
          category: "Onboarding" // <-- Replace "Onboarding" with your desired category string
        },
      });
      console.log(`[Worker][Onboarding] Ensured existence of achievement: "${ACHIEVEMENT_TITLE}".`);

      // Award the achievement to the user
      await tx.userAchievement.createMany({
        data: [{ userId, achievementId: welcomeAchievement.id }],
        skipDuplicates: true // Prevents error if achievement already awarded
      });
      console.log(`[Worker][Onboarding] Awarded achievement "${ACHIEVEMENT_TITLE}" to user ${userId}.`);
    });

    console.log(`[Worker][Onboarding] Onboarding bonus successfully processed for user ${userId}.`);
  } catch (error) {
    console.error(`[Worker][Onboarding] Failed to process onboarding bonus for user ${userId}:`, error);
    throw error;
  }
};

// Create a worker for the 'onboarding-jobs' queue
const worker = createWorker('onboarding-jobs', processOnboardingBonus, {
  concurrency: 3,
});

console.log('🚀 Onboarding worker started!');
