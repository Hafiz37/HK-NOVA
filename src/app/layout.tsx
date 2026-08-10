import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import ClientOnly from '@/components/ClientOnly';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'HK-NOVA - Network Operations Center',
  description: 'Platform monitoring, otomasi, dan kecerdasan buatan untuk NOC ISP',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className="dark">
      <body className={inter.className}>
        <ClientOnly>{children}</ClientOnly>
      </body>
    </html>
  );
}
