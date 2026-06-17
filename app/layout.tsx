import type { Metadata } from 'next';
import { Space_Grotesk, Inter } from 'next/font/google';
import './globals.css';
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from '@/lib/site';
import { MotionProvider } from '@/components/motion/MotionProvider';

// Display: heavy geometric grotesk with real personality at large sizes.
const display = Space_Grotesk({
  variable: '--font-display',
  subsets: ['latin'],
  weight: ['500', '700'],
  display: 'swap',
});

// Body: Inter — chosen for legibility (it's an accessibility site, after all).
const sans = Inter({
  variable: '--font-sans',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
};

/**
 * Minimal root: fonts, global styles, and the motion provider. The chrome lives
 * in the route-group layouts — `(marketing)` renders the public nav + footer,
 * `(app)` renders the signed-in dashboard shell (sidebar). Keeping the root bare
 * lets those two surfaces look completely different.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${display.variable} ${sans.variable} h-full antialiased`}
    >
      <head>
        <script
          src="http://localhost:3000/embed/web-access.global.js"
          data-site-id="site_b2fd04fa5a1c49a58d1513a4be881c52"
          data-ingest="http://localhost:3000"
          async
        ></script>
      </head>
      <body className="min-h-full flex flex-col">
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
