import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["net-ping", "net-snmp", "ssh2", "raw-socket", "pdfkit", "exceljs"],
};

export default nextConfig;
