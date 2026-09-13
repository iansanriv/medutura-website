import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Medutura | Bolsos y accesorios textiles",
  description: "Bolsos, accesorios y piezas textiles con entregas coordinadas según la ubicación.",
  icons: {
    icon: "/medutura-symbol-v3.png",
    shortcut: "/medutura-symbol-v3.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-PR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
