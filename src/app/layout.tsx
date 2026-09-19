import type { Metadata } from "next";
import { Instrument_Sans, JetBrains_Mono } from "next/font/google";
import { Backdrop } from "@/components/layout/Backdrop";
import "./globals.css";

const instrumentSans = Instrument_Sans({
  variable: "--font-instrument",
  weight: ["500", "600", "700"],
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  weight: ["400", "500"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Orbital on Stellar",
  description: "Orbital multi-stablecoin AMM demo on Stellar",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${instrumentSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Backdrop />
        <main className="relative min-h-screen text-fg">{children}</main>
      </body>
    </html>
  );
}
