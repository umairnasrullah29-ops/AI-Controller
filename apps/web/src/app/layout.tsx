import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Local PC Controller",
  description: "Secure, local-first AI assistant for OS control and automation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background flex flex-col antialiased">
        {children}
      </body>
    </html>
  );
}
