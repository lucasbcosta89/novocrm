import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Plurima",
  description: "CRM para representante comercial multimarcas",
};

const SCRIPT_TEMA =
  "try{var t=localStorage.getItem('tema');if(t==='escuro'||t==='sistema')document.documentElement.dataset.tema=t}catch(e){}";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" data-tema="claro" suppressHydrationWarning>
      <head>
        {/* aplica o tema salvo antes de pintar a tela (evita piscar claro→escuro) */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
