import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/withAuth';
import { onboardingService } from '@/lib/services/onboarding.service';
import { onboardingSchema } from '@/dtos/onboarding.dto';

const handleOnboardingProgress = async (req: NextRequest, { user }: { user: AuthUser }) => {
  const body = await req.json();
  const validationResult = onboardingSchema.safeParse(body);
 // console.log('Validation Result:', validationResult); // Debugging line to check the validation result
  if (!validationResult.success) {
    return NextResponse.json({ message: 'Invalid input', errors: validationResult.error.errors }, { status: 400 });
  }

  try {
    const result = await onboardingService.updateOnboardingProgress(user.id, validationResult.data);
    console.log('Onboarding Progress Update Result:', result); // Debugging line to check the result of the update
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ message: 'An internal server error occurred' }, { status: 500 });
  }
};

export const PUT = withAuth([], handleOnboardingProgress);
