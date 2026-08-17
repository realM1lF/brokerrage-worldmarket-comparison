import type { Metadata } from 'next';
import '@fontsource-variable/outfit';
import './globals.css';

export const metadata: Metadata = {
  title: 'Portfolio ↔ Weltmarkt',
  description:
    'Ziel-Gewichtung und Umschichtungsplan, um den Weltmarkt (MSCI ACWI IMI, Marktkap/GDP/PPP) abzubilden.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
