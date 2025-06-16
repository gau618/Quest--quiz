// src/lib/cloudinary/config.ts

import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export function generateCloudinarySignature(userId: string) {
  const timestamp = Math.round(new Date().getTime() / 1000);
  const folder = `quiz-app/avatars/${userId}`;
  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder },
    process.env.CLOUDINARY_API_SECRET!
  );
  return { timestamp, signature, folder };
}
