import type { Metadata } from "next";
import type { ReactNode } from "react";

import { GlobalNav } from "@/components/navigation/global-nav";

import "./globals.css";

export const metadata: Metadata = {
  title: "IA Supervisor",
  description: "Teacher-led IA supervision workspace",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <GlobalNav />
        {children}
      </body>
    </html>
  );
}
