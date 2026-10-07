import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  // upload de imagem de produto (até 2 MB) via server action
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
};

export default nextConfig;

initOpenNextCloudflareForDev();
