import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stayhand",
  description: "Stayhand helps people avoid regret by adding intentional friction only when risk is high.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
