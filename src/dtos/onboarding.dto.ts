import { z } from 'zod';
import { ExperienceLevel } from '@prisma/client';

const profileSetupSchema = z.object({
  bio: z.string().max(500, 'Bio cannot exceed 500 characters').optional(),
  location: z.string().max(100).optional(),
  website: z.string().url('Must be a valid URL').optional(),
  avatarUrl: z.string().url('Invalid avatar URL').optional(),
});

const experienceAssessmentSchema = z.object({
  experienceLevel: z.nativeEnum(ExperienceLevel),
  interestAreas: z.array(z.string()).min(1, 'Select at least one interest area'),
});

const gamePreferencesSchema = z.object({
  favoriteGameModes: z.array(z.string()).optional(),
  defaultDifficulty: z.string().optional(),
  notificationPreferences: z.record(z.boolean()).optional(),
});

const practiceGameSchema = z.object({
  gameSessionId: z.string().cuid('Invalid game session ID'),
  score: z.number().int(),
});

export const onboardingSchema = z.discriminatedUnion('step', [
  z.object({ step: z.literal('profileSetup'), data: profileSetupSchema }),
  z.object({ step: z.literal('experienceAssessment'), data: experienceAssessmentSchema }),
  z.object({ step: z.literal('gamePreferences'), data: gamePreferencesSchema }),
  z.object({ step: z.literal('practiceGame'), data: practiceGameSchema }),
]);
