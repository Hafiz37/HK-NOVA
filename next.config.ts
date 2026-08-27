import type { NextConfig } from "next";
import withBundleAnalyzer from "@next/bundle-analyzer";

const bundleAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  serverExternalPackages: ["net-ping", "net-snmp", "ssh2", "raw-socket", "pdfkit", "exceljs", "@tensorflow/tfjs-node"],
  turbopack: {
    resolveAlias: {
      '@tensorflow/tfjs-node': '@tensorflow/tfjs',
    },
  },
};

export default bundleAnalyzer(nextConfig);
