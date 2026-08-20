/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    config.watchOptions = {
      ...config.watchOptions,
      ignored: /temp_workspaces/,
    };
    return config;
  },
};

export default nextConfig;
