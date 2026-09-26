import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse", "@react-pdf/renderer", "mammoth"],
};

export default nextConfig;
