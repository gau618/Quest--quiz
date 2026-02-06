// src/app/api/onboarding/avatar-signature/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/withAuth';
import { generateCloudinarySignature } from '@/lib/cloudinary/config';

const getAvatarUploadSignature = async (_req: NextRequest, { user }: { user: AuthUser }) => {
  try {
    const { timestamp, signature, folder } = generateCloudinarySignature(user.id);
    return NextResponse.json({
      timestamp,
      signature,
      folder,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      // apiKey removed - client will get it from NEXT_PUBLIC_CLOUDINARY_API_KEY if needed
      // Never expose server-side API keys in responses
    });
  } catch (error) {
    return NextResponse.json({ message: 'Could not prepare file upload.' }, { status: 500 });
  }
};

export const POST = withAuth([], getAvatarUploadSignature);
