// src/lib/services/onboarding.service.ts

import prisma from '../prisma/client';
import { queueService } from '../queue/config';
import { OnboardingInput } from '@/dtos/onboarding.dto';

interface OnboardingState {
  stepsCompleted: Record<string, boolean>;
  bonusAwarded?: boolean;
}

class OnboardingService {
  private async getOrCreateProfile(userId: string) {
    const profile = await prisma.userProfile.findUnique({ where: { userId } });
    if (profile) return profile;
    return prisma.userProfile.create({
      data: {
        userId,
        onboardingState: { stepsCompleted: {} },
      },
    });
  }

  public async updateProgress(userId: string, validatedData: OnboardingInput) {
    const { step, data } = validatedData;
    const userProfile = await this.getOrCreateProfile(userId);
    console.log(userProfile);
    const updatedProfile = await prisma.$transaction(async (tx) => {
      let updateData: any = {};

      switch (step) {
        case 'profileSetup':
        case 'experienceAssessment':
          updateData = data;
          break;
        case 'gamePreferences':
          updateData.notificationSettings = data.notificationPreferences;
          break;
        case 'practiceGame':
          break;
      }

      const currentState = (userProfile.onboardingState as OnboardingState) || { stepsCompleted: {} };
      const newStepsCompleted = { ...currentState.stepsCompleted, [step]: true };
      const updatedState: OnboardingState = {
        ...currentState,
        stepsCompleted: newStepsCompleted,
      };

      await tx.userProfile.update({
        where: { userId },
        data: {
          ...updateData,
          onboardingState: updatedState,
        },
      });

      await this.checkForCompletion(userId, updatedState, tx);

      return tx.userProfile.findUniqueOrThrow({ where: { userId } });
    });

    return {
      success: true,
      onboardingState: updatedProfile.onboardingState as OnboardingState,
    };
  }

  private async checkForCompletion(userId: string, state: OnboardingState, tx: any) {
    const requiredSteps = ['profileSetup', 'experienceAssessment', 'gamePreferences', 'practiceGame'];
    const allStepsComplete = requiredSteps.every(s => state.stepsCompleted?.[s]);

    if (allStepsComplete && !state.bonusAwarded) {
      await queueService.dispatch('onboarding-jobs', { userId });
      state.bonusAwarded = true;
      await tx.userProfile.update({
        where: { userId },
        data: { onboardingState: state },
      });
    }
  }
}

export const onboardingService = new OnboardingService();
