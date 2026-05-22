import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SCP - Sistema de Compartilhamento de Arquivos",
  description: "Compartilhamento seguro e rápido de arquivos com links diretos e portais customizados.",
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
