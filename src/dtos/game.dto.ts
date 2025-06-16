// src/dtos/game.dto.ts

import { z } from 'zod';

export const findMatchSchema = z.object({
  duration: z.union([z.literal(1), z.literal(2), z.literal(5)]),
});
