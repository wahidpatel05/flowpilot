import type { Metadata } from "next";
import "./globals.css";
import { SiteNav } from "../components/SiteNav";

export const metadata: Metadata = {
  title: "DeQueue",
  description: "Closed-loop AI orchestration for physical waiting.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <SiteNav />
        {children}
      </body>
    </html>
  );
}
