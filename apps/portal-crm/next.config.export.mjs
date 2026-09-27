/** Static export config for Arara hosting (client-only CRM UI). */
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  typescript: { ignoreBuildErrors: true },
  trailingSlash: true,
}

export default nextConfig
