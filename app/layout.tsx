import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Medutura | Piezas hechas a mano en Puerto Rico",
  description: "Accesorios y piezas de moda cosidas a mano en Puerto Rico.",
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
