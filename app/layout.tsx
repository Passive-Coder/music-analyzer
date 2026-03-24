import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Metallic 3D Note",
  description:
    "A centered light gray metallic 3D note on a dark purple background rendered with Three.js.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
