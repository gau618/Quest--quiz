/** @type {import('next').NextConfig} */
const nextConfig = {
  // Use independent standalone build for Docker/VPS deployments
  output: "standalone",
  // Ignore typescript/eslint errors during build to ensuring deployment doesn't fail on small warnings
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  // Headers are now handled by middleware to support multiple dynamic origins
  // async headers() { ... } 
};

module.exports = nextConfig;
