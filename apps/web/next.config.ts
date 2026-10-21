import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  // uploads via server action: imagem de produto (2 MB) e documentos da representada (10 × 10 MB, limite prático 25 MB)
  experimental: { serverActions: { bodySizeLimit: "25mb" } },
};

export default nextConfig;

initOpenNextCloudflareForDev();
