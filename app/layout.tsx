import type { Metadata, Viewport } from 'next';
import '../src/styles/globals.css';

export const metadata: Metadata = {
  title: 'Penny Pedagogy - AI Lesson Plan Generator',
  description: 'An equity-centered AI instructional design partner for high school educators. Create rigorous, accessible, UDL-informed lesson plans with embedded accommodations.',
  keywords: ['lesson plan', 'AI', 'education', 'UDL', 'equity', 'instructional design', 'high school', 'teaching'],
  authors: [{ name: 'Amy Henderson' }],
  creator: 'Amy Henderson',
  openGraph: {
    title: 'Penny Pedagogy - AI Lesson Plan Generator',
    description: 'Create rigorous, accessible, UDL-informed lesson plans with an AI instructional design partner.',
    type: 'website',
    locale: 'en_US',
    siteName: 'Penny Pedagogy',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Penny Pedagogy - AI Lesson Plan Generator',
    description: 'Create rigorous, accessible, UDL-informed lesson plans with an AI instructional design partner.',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1a1a1a',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Oswald:wght@400;500;600;700&family=Courier+Prime:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
