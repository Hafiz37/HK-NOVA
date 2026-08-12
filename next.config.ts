import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["net-ping", "net-snmp", "ssh2", "raw-socket"],
};

export default nextConfig;
