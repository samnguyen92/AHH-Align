import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/generated-clinics/:path*',
        destination: '/uploads/generated-clinics/:path*',
      },
    ];
  },
  images: {
    localPatterns: [
      {
        pathname: '/**',
        search: '?*',
      },
      {
        pathname: '/**',
        search: '',
      },
    ],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: '**',
      },
    ],
  },
};

export default nextConfig;
