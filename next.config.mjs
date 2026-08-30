/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["dockerode", "ssh2", "node-pty"],
  },
  webpack: (config, { isServer }) => {
    config.watchOptions = {
      ...config.watchOptions,
      ignored: /temp_workspaces/,
    };
    return config;
  },
};

export default nextConfig;
