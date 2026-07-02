/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @fourotwo/types is a workspace TS package consumed directly from source.
  transpilePackages: ['@fourotwo/types'],
};

export default nextConfig;
