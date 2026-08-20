import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CodeTogether",
  description: "Code Together, Learn Faster",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans">{children}</body>
    </html>
  );
}
