import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Repertoire & Probeplan",
  description:
    "Repertoire-Verwaltung, Spieler-Bewertungen, Terminkalender und intelligenter Probeplan",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" className="dark">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}

