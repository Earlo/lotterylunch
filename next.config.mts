import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactCompiler: true,
  typedRoutes: true,
  experimental: {
    typedEnv: true,
  },
};

export default nextConfig;
