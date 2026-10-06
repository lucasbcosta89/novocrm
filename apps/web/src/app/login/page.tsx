import Link from "next/link";
import { entrar } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  return (
    <main className="auth">
      <form action={entrar}>
        <h1>Entrar</h1>
        <label>
          E-mail
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Senha
          <input name="senha" type="password" autoComplete="current-password" minLength={8} required />
        </label>
        {erro && <p className="erro">{erro}</p>}
        <button className="btn" type="submit">Entrar</button>
        <p className="alt">
          Não tem conta? <Link href="/signup">Criar conta</Link>
        </p>
      </form>
    </main>
  );
}
