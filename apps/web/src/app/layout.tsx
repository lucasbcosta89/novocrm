import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CRM Multimarcas",
  description: "CRM para representante comercial multimarcas",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
