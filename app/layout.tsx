import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stayhand — The friction you deserve",
  description: "Every app makes you act faster. Stayhand makes you act better. Intentional friction for the moments that matter.",
  openGraph: {
    title: "Stayhand",
    description: "Intentional friction for the moments that matter.",
    type: "website",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
