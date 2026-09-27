import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build standalone para imagem Docker enxuta (padrão de deploy Arara — portal-suporte)
  output: "standalone",
};

export default nextConfig;
