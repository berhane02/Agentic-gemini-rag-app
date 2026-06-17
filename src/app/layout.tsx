import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from '@clerk/nextjs';
import { UserProvider } from '@/contexts/UserContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "RAG Agent - AI-Powered Document Q&A",
  description: "Ask questions about your uploaded documents using AI-powered RAG technology",
  keywords: ["RAG", "agent", "AI", "document analysis", "Q&A"],
  authors: [{ name: "RAG Agent Team" }],
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('theme');
                  if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                    document.documentElement.classList.add('dark');
                  } else {
                    document.documentElement.classList.remove('dark');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <ClerkProvider
        signInFallbackRedirectUrl="/chat"
        signUpFallbackRedirectUrl="/chat"
        afterSignOutUrl="/home"
      >
        <body
          className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        >
          <ErrorBoundary>
            <UserProvider>
              {children}
            </UserProvider>
          </ErrorBoundary>
        </body>
      </ClerkProvider>
    </html>
  );
}
