import type { Metadata } from "next";
import "./globals.css";
import "./polish.css";
import "./workspace-pages.css";
import "./operations.css";

export const metadata: Metadata = {
  title: "ApparelFlow — Production Gate",
  description: "Every piece counts. A secure cutting verification and sewing handoff workspace.",
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
