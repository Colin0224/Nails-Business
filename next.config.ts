import type { NextConfig } from "next";

const nextConfig: any = {
  /* config options here */
  // Allow accessing the dev server from your LAN device
  allowedDevOrigins: ['local-origin.dev', '*.local-origin.dev', '192.168.0.19'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: '**.firebaseapp.com',
      },
      {
        protocol: 'https',
        hostname: '**.appspot.com',
      },
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
      },
    ],
  },
};

export default nextConfig;
