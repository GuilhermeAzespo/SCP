import type { Metadata } from "next";
import { Toaster } from "react-hot-toast";
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
      <body>
        <Toaster 
          position="top-center" 
          toastOptions={{
            style: {
              background: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--glass-border)',
              borderRadius: 'var(--border-radius-md)',
              boxShadow: 'var(--shadow-md)',
            },
            success: {
              iconTheme: {
                primary: 'var(--accent-success)',
                secondary: 'white',
              },
            },
            error: {
              iconTheme: {
                primary: 'var(--accent-danger)',
                secondary: 'white',
              },
            },
          }} 
        />
        {children}
      </body>
    </html>
  );
}
