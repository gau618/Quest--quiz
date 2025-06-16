// src/dtos/onboarding.dto.ts

import { z } from 'zod';
import { ExperienceLevel } from '@prisma/client';

const profileSetupSchema = z.object({
  bio: z.string().max(500).optional(),
  location: z.string().max(100).optional(),
  website: z.string().url().optional(),
  avatarUrl: z.string().url().optional(),
});

const experienceAssessmentSchema = z.object({
  experienceLevel: z.nativeEnum(ExperienceLevel),
  interestAreas: z.array(z.string()).min(1),
});

const gamePreferencesSchema = z.object({
  favoriteGameModes: z.array(z.string()).optional(),
  defaultDifficulty: z.string().optional(),
  notificationPreferences: z.record(z.boolean()).optional(),
});

const practiceGameSchema = z.object({
  gameSessionId: z.string().cuid(),
  score: z.number().int(),
});

export const onboardingSchema = z.discriminatedUnion('step', [
  z.object({ step: z.literal('profileSetup'), data: profileSetupSchema }),
  z.object({ step: z.literal('experienceAssessment'), data: experienceAssessmentSchema }),
  z.object({ step: z.literal('gamePreferences'), data: gamePreferencesSchema }),
  z.object({ step: z.literal('practiceGame'), data: practiceGameSchema }),
]);

export type OnboardingStep = z.infer<typeof onboardingSchema>['step'];
export type OnboardingData = z.infer<typeof onboardingSchema>['data'];
export type OnboardingInput = z.infer<typeof onboardingSchema>;
