import Link from "next/link";
import { criarConta } from "./actions";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  return (
    <main className="auth">
      <form action={criarConta}>
        <h1>Criar conta</h1>
        <label>
          Nome
          <input name="nome" autoComplete="name" required />
        </label>
        <label>
          E-mail
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Senha
          <input name="senha" type="password" autoComplete="new-password" minLength={8} required />
        </label>
        {erro && <p className="erro">{erro}</p>}
        <button className="btn" type="submit">Criar conta</button>
        <p className="alt">
          Já tem conta? <Link href="/login">Entrar</Link>
        </p>
      </form>
    </main>
  );
}
