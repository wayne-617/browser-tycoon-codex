import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Browser Tycoon | Build Your Tech Empire",
  description: "Start with a blank browser. Research, design, and conquer the web in Browser Tycoon.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
