import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Medutura por Annelys | Accesorios confeccionados en Puerto Rico",
  description: "Accesorios diseñados y confeccionados por Annelys en el Área Metro de Puerto Rico.",
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
