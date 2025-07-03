/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Danger: This allows production builds to succeed even with type errors.
    ignoreBuildErrors: true,
  },
};

module.exports = nextConfig;
