import prisma from "../../prisma/client";
import { queueService } from "../../queue/config";
import { OnboardingInput } from "@/dtos/onboarding.dto";

interface OnboardingState {
  stepsCompleted: Record<string, boolean>;
  bonusAwarded?: boolean;
}

class OnboardingService {
  // Accept name and username from microservice and always use them
  private async getOrCreateProfile(
    userId: string,
    name?: string,
    username?: string
  ) {
    let profile = await prisma.userProfile.findUnique({ where: { userId } });
    if (profile) {
      // Update name/username if changed in microservice
      if (profile.name !== name || profile.username !== username) {
        profile = await prisma.userProfile.update({
          where: { userId },
          data: { name, username }, // <-- UPDATED: always sync name/username
        });
      }
      return profile;
    }
    return prisma.userProfile.create({
      data: {
        userId,
        name, // <-- UPDATED: set name from microservice
        username, // <-- UPDATED: set username from microservice
        onboardingState: { stepsCompleted: {} },
      },
    });
  }

  // Accept name and username, always pass from API route
  public async updateProgress(
    userId: string,
    validatedData: OnboardingInput,
    name?: string,
    username?: string
  ) {
    const { step, data } = validatedData;
    const userProfile = await this.getOrCreateProfile(userId, name, username); // <-- UPDATED: pass name/username
    console.log(userProfile);
    const updatedProfile = await prisma.$transaction(async (tx) => {
      let updateData: any = {};

      switch (step) {
        case "profileSetup":
        case "experienceAssessment":
          updateData = data;
          // Always update name/username from microservice
          updateData.name = name; // <-- UPDATED: always set name
          updateData.username = username; // <-- UPDATED: always set username
          break;
        case "gamePreferences":
          updateData.notificationSettings = data.notificationPreferences;
          break;
        case "practiceGame":
          break;
      }

      const currentState = (userProfile.onboardingState as unknown as OnboardingState) || {
        stepsCompleted: {},
      };
      const newStepsCompleted = {
        ...currentState.stepsCompleted,
        [step]: true,
      };
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
      onboardingState: updatedProfile.onboardingState as unknown as OnboardingState,
    };
  }

  private async checkForCompletion(
    userId: string,
    state: OnboardingState,
    tx: any
  ) {
    const requiredSteps = [
      "profileSetup",
      "experienceAssessment",
      "gamePreferences",
      "practiceGame",
    ];
    const allStepsComplete = requiredSteps.every(
      (s) => state.stepsCompleted?.[s]
    );

    if (allStepsComplete && !state.bonusAwarded) {
      await queueService.dispatch("onboarding-jobs", { userId });
      state.bonusAwarded = true;
      await tx.userProfile.update({
        where: { userId },
        data: { onboardingState: state },
      });
    }
  }
}

export const onboardingService = new OnboardingService();
