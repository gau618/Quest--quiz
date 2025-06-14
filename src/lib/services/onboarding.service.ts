import { PrismaClient } from '@prisma/client';
import { queueService } from './queue.service';

const prisma = new PrismaClient();

class OnboardingService {
  public async updateOnboardingProgress(userId: string, stepData: any) {
    const { step, data } = stepData;
    //console.log('Updating onboarding progress for user:', userId, 'Step:', step, 'Data:', data);
    const userProfile = await this.getOrCreateProfile(userId);
    console.log('User Profile:', userProfile);
    await prisma.$transaction(async (tx) => {
      // Update profile based on the step
      switch (step) {
        case 'profileSetup':
          console.log('Updating profile setup for user:', userId);
          await tx.userProfile.update({ where: { userId }, data });
          break;
        case 'experienceAssessment':
          await tx.userProfile.update({ where: { userId }, data });
          break;
        case 'gamePreferences':
          await tx.userProfile.update({
            where: { userId },
            data: { notificationSettings: data.notificationPreferences },
          });
          break;
        case 'practiceGame':
          break;
      }

      // Update onboarding state JSON to track progress
      const currentState = (userProfile.onboardingState || { stepsCompleted: {} }) as any;
      currentState.stepsCompleted[step] = true;
      await tx.userProfile.update({
        where: { userId },
        data: { onboardingState: currentState },
      });
      
      await this.checkForCompletion(userId, currentState, tx);
    });

    const updatedProfile = await prisma.userProfile.findUnique({ where: { userId } });
    return { success: true, onboardingState: updatedProfile?.onboardingState };
  }

  private async checkForCompletion(userId: string, state: any, tx: any) {
    const requiredSteps = ['profileSetup', 'experienceAssessment', 'gamePreferences', 'practiceGame'];
    const allStepsComplete = requiredSteps.every(s => state.stepsCompleted?.[s] === true);

    if (allStepsComplete && !state.bonusAwarded) {
      await queueService.addOnboardingCompletedJob(userId);
      state.bonusAwarded = true;
      await tx.userProfile.update({
        where: { userId },
        data: { onboardingState: state },
      });
    }
  }

  private async getOrCreateProfile(userId: string) {
    console.log('Retrieving or creating profile for user:', userId);
    let profile = await prisma.userProfile.findUnique({ where: { userId } });
    if (!profile) {
      profile = await prisma.userProfile.create({ data: { userId } });
    }
    console.log('Retrieved profile:', profile);
    return profile;
  }
}

export const onboardingService = new OnboardingService();
