// src/app/api/onboarding/progress/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { onboardingSchema } from '@/dtos/onboarding.dto';
import { onboardingService } from '@/lib/services/onboarding.service';

export const PUT = withAuth([], async (req, { user }) => {
  try {
    const body = await req.json();
    const validation = onboardingSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ message: 'Invalid request body', errors: validation.error.errors }, { status: 400 });
    }

    const result = await onboardingService.updateProgress(user.id, validation.data);

    return NextResponse.json(result);
  } catch (error) {
    console.error('[Onboarding Progress Error]', error);
    return NextResponse.json({ message: 'An internal server error occurred' }, { status: 500 });
  }
});
