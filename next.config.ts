import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["net-ping", "net-snmp", "ssh2", "raw-socket", "pdfkit", "exceljs", "@tensorflow/tfjs-node"],
  turbopack: {
    resolveAlias: {
      '@tensorflow/tfjs-node': '@tensorflow/tfjs',
    },
  },
};

export default nextConfig;
