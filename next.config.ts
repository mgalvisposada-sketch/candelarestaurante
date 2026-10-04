import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Contratos/PDFs pasan por middleware/proxy + Server Action.
    // Defaults: proxy 10 MB, actions 1 MB → truncan el multipart.
    // La acción valida hasta 20 MB; dejamos margen.
    proxyClientMaxBodySize: "21mb",
    serverActions: {
      bodySizeLimit: "21mb",
    },
  },
};

export default nextConfig;
