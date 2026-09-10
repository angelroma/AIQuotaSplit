import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AIQuotaSplit · Weekly Codex usage",
  description: "A private, two-person estimate of shared weekly Codex usage.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
