import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "octave",
  description:
    "A centered light gray metallic 3D note on a dark purple background rendered with Three.js.",
  icons: {
    icon: "/images/website_icon.png",
  },
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
