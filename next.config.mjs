/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: [
      'playwright-core',
      'playwright',
      'chromium-bidi',
      'pdf-parse',
    ],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : [config.externals].filter(Boolean)),
        'playwright-core',
        'playwright',
        'chromium-bidi',
      ];
    }
    return config;
  },
};

export default nextConfig;
