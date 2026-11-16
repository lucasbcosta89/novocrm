"use server";

import { redirect } from "next/navigation";
import { unstable_rethrow } from "next/navigation";
import type { EstadoAcao } from "@/components/dados-usuario";
import { obterContexto } from "@/server/contexto";
import { normalizarErro } from "@/server/erros";
import { revelarDocumentos, salvarPerfil } from "@/server/perfil";
import { executarAcao } from "@/server/acao";
import { salvarConfiguracaoPedidos } from "@/server/configuracao-pedidos";

/** CPF/CNPJ não revelados no formulário de edição: mantém os já gravados. */
async function montarDados(fd: FormData) {
  const dados = Object.fromEntries(fd) as Record<string, string>;
  if (dados.documentos_revelados !== "1") {
    const atuais = await revelarDocumentos(await obterContexto());
    dados.cpf = atuais.cpf ?? "";
    dados.cnpj = atuais.cnpj ?? "";
  }
  return dados;
}

/** Fase 17.1 (F): desconto máximo padrão da conta (cascata produto → representada → padrão → 10). */
export async function salvarDescontoPadraoAction(fd: FormData) {
  await executarAcao((ctx) => salvarConfiguracaoPedidos(ctx, fd.get("desconto_max_padrao")), {
    ok: "/app/perfil#pedidos", erro: "/app/perfil#pedidos", mensagem: "Desconto máximo padrão salvo",
  });
}

export async function concluirCadastroAction(_: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  try {
    await salvarPerfil(await obterContexto(), Object.fromEntries(fd), true);
  } catch (e) {
    unstable_rethrow(e);
    return { erro: normalizarErro(e).message };
  }
  redirect("/app/perfil?ok=Cadastro%20conclu%C3%ADdo");
}

export async function salvarPerfilAction(_: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  try {
    await salvarPerfil(await obterContexto(), await montarDados(fd), false);
    return { ok: "Dados salvos" };
  } catch (e) {
    unstable_rethrow(e);
    return { erro: normalizarErro(e).message };
  }
}

/** Revela CPF/CNPJ completos do próprio usuário (só na página de edição). */
export async function revelarDocumentosAction() {
  return revelarDocumentos(await obterContexto());
}
