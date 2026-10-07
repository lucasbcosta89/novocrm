import { useMemo, useState } from "react";
import { Alert, FlatList, Pressable, ScrollView, Text, View } from "react-native";
import { supabase } from "./config";
import {
  listarClientes, obterCliente, pedidosDoCliente, produtosDaRepresentada, registrarPedido, registrarVisita,
  representadasDoCliente, salvarCliente, visitasDoCliente, type Cliente,
} from "./db";
import { Botao, Campo, Cartao, dataHora, moeda, Opcoes, s, Selo, Suave, Titulo, useCores } from "./ui";

export type Rota =
  | { tela: "clientes" }
  | { tela: "cliente"; id: string }
  | { tela: "novoCliente" }
  | { tela: "visita"; clienteId: string }
  | { tela: "pedido"; clienteId: string };

type Nav = { ir: (r: Rota) => void; voltar: () => void; alterou: () => void; versao: number };

/* ---------- Login ---------- */

export function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(false);
  async function entrar() {
    setCarregando(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: senha });
    setCarregando(false);
    if (error) Alert.alert("Não foi possível entrar", "Confira e-mail e senha (é preciso internet no primeiro acesso).");
  }
  return (
    <View style={[s.tela, { flex: 1, justifyContent: "center" }]}>
      <Titulo>CRM Multimarcas</Titulo>
      <Suave>Entre com a mesma conta do CRM web.</Suave>
      <Campo rotulo="E-mail" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <Campo rotulo="Senha" value={senha} onChangeText={setSenha} secureTextEntry autoComplete="password" />
      <Botao titulo={carregando ? "Entrando…" : "Entrar"} onPress={entrar} desabilitado={carregando || !email || senha.length < 8} />
    </View>
  );
}

/* ---------- Clientes ---------- */

export function Clientes({ ir, versao }: Nav) {
  const c = useCores();
  const [busca, setBusca] = useState("");
  // versao força releitura do SQLite após sync/escrita
  const clientes = useMemo(() => listarClientes(busca), [busca, versao]);
  return (
    <View style={{ flex: 1 }}>
      <View style={[s.tela, { paddingBottom: 0 }]}>
        <Campo rotulo="Buscar cliente" value={busca} onChangeText={setBusca} placeholder="Nome" />
        <Botao titulo="+ Novo cliente" variante="secundario" onPress={() => ir({ tela: "novoCliente" })} />
      </View>
      <FlatList
        data={clientes}
        keyExtractor={(x) => x.id}
        contentContainerStyle={[s.tela, { paddingBottom: 40 }]}
        ListEmptyComponent={<Suave>Nenhum cliente. Sincronize ou cadastre um novo.</Suave>}
        renderItem={({ item }) => (
          <Pressable onPress={() => ir({ tela: "cliente", id: item.id })} accessibilityRole="button">
            <Cartao>
              <Text style={{ color: c.texto, fontSize: 16, fontWeight: "600" }}>{item.nome}</Text>
              <Suave>{[item.cidade, item.uf].filter(Boolean).join("/") || "—"}</Suave>
              {item.sync_status !== "sincronizado" && <Selo status={item.sync_status} />}
            </Cartao>
          </Pressable>
        )}
      />
    </View>
  );
}

export function NovoCliente({ voltar, alterou }: Nav) {
  const [d, setD] = useState<Partial<Cliente>>({});
  const campo = (k: keyof Cliente) => ({ value: (d[k] as string) ?? "", onChangeText: (v: string) => setD({ ...d, [k]: v }) });
  function salvar() {
    if (!d.nome || d.nome.trim().length < 2) return Alert.alert("Informe o nome do cliente");
    salvarCliente({ ...d, nome: d.nome.trim() });
    alterou();
    voltar();
  }
  return (
    <ScrollView contentContainerStyle={s.tela} keyboardShouldPersistTaps="handled">
      <Titulo>Novo cliente</Titulo>
      <Campo rotulo="Nome *" {...campo("nome")} />
      <Campo rotulo="CPF/CNPJ" {...campo("documento")} keyboardType="number-pad" />
      <Campo rotulo="WhatsApp" {...campo("whatsapp")} keyboardType="phone-pad" />
      <Campo rotulo="E-mail" {...campo("email")} keyboardType="email-address" autoCapitalize="none" />
      <Campo rotulo="Cidade" {...campo("cidade")} />
      <Campo rotulo="UF" {...campo("uf")} autoCapitalize="characters" maxLength={2} />
      <Campo rotulo="Anotações" {...campo("anotacoes")} multiline />
      <Botao titulo="Salvar (funciona offline)" onPress={salvar} />
    </ScrollView>
  );
}

export function ClienteDetalhe({ id, ir, versao }: Nav & { id: string }) {
  const c = useCores();
  const dados = useMemo(
    () => ({ cliente: obterCliente(id), visitas: visitasDoCliente(id), pedidos: pedidosDoCliente(id), reps: representadasDoCliente(id) }),
    [id, versao],
  );
  if (!dados.cliente) return <View style={s.tela}><Suave>Cliente não encontrado.</Suave></View>;
  const cli = dados.cliente;
  return (
    <ScrollView contentContainerStyle={s.tela}>
      <Titulo>{cli.nome}</Titulo>
      <Suave>{[cli.cidade, cli.uf].filter(Boolean).join("/") || "Sem cidade"} · {cli.whatsapp ?? cli.celular ?? "sem WhatsApp"}</Suave>
      {cli.sync_status !== "sincronizado" && <Selo status={cli.sync_status} />}
      {cli.sync_erro && <Text style={{ color: c.perigo }}>{cli.sync_erro}</Text>}
      <Suave>Representadas: {dados.reps.map((r) => r.nome).join(", ") || "nenhuma"}</Suave>

      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1 }}><Botao titulo="Registrar visita" onPress={() => ir({ tela: "visita", clienteId: id })} /></View>
        <View style={{ flex: 1 }}><Botao titulo="Novo pedido" variante="secundario" onPress={() => ir({ tela: "pedido", clienteId: id })} /></View>
      </View>

      <Titulo>Visitas</Titulo>
      {dados.visitas.length === 0 && <Suave>Nenhuma visita.</Suave>}
      {dados.visitas.map((v) => (
        <Cartao key={v.id}>
          <Text style={{ color: c.texto, fontWeight: "600" }}>{dataHora(v.data)} · {v.tipo}</Text>
          {v.resultado && <Text style={{ color: c.texto }}>Resultado: {v.resultado}</Text>}
          {v.anotacoes && <Suave>{v.anotacoes}</Suave>}
          <Selo status={v.sync_status} />
          {v.sync_erro && <Text style={{ color: c.perigo }}>{v.sync_erro}</Text>}
        </Cartao>
      ))}

      <Titulo>Pedidos</Titulo>
      {dados.pedidos.length === 0 && <Suave>Nenhum pedido.</Suave>}
      {dados.pedidos.map((p) => (
        <Cartao key={p.id}>
          <Text style={{ color: c.texto, fontWeight: "600" }}>{p.numero ?? "Novo pedido"} · {moeda(p.valor_total)}{p.numero ? "" : " (estimado)"}</Text>
          <Suave>{dataHora(p.data)} · {p.status}</Suave>
          <Selo status={p.sync_status} />
          {p.sync_erro && <Text style={{ color: c.perigo }}>{p.sync_erro}</Text>}
        </Cartao>
      ))}
    </ScrollView>
  );
}

/* ---------- Visita (offline) ---------- */

const TIPOS = [
  { valor: "presencial", rotulo: "Presencial" },
  { valor: "telefone", rotulo: "Telefone" },
  { valor: "whatsapp", rotulo: "WhatsApp" },
  { valor: "video", rotulo: "Vídeo" },
] as const;

export function NovaVisita({ clienteId, voltar, alterou }: Nav & { clienteId: string }) {
  const reps = useMemo(() => representadasDoCliente(clienteId), [clienteId]);
  const [tipo, setTipo] = useState<(typeof TIPOS)[number]["valor"]>("presencial");
  const [rep, setRep] = useState<string | null>(reps.length === 1 ? reps[0]!.id : null);
  const [resultado, setResultado] = useState("");
  const [anotacoes, setAnotacoes] = useState("");
  function salvar() {
    registrarVisita({
      cliente_id: clienteId, representada_id: rep, data: new Date().toISOString(), tipo,
      resultado: resultado.trim() || null, anotacoes: anotacoes.trim() || null,
    });
    alterou();
    voltar();
  }
  return (
    <ScrollView contentContainerStyle={s.tela} keyboardShouldPersistTaps="handled">
      <Titulo>Registrar visita</Titulo>
      <Suave>Fica salva no aparelho e sincroniza quando houver conexão.</Suave>
      <Suave>Tipo</Suave>
      <Opcoes opcoes={[...TIPOS]} valor={tipo} onChange={setTipo} />
      {reps.length > 0 && (
        <>
          <Suave>Representada</Suave>
          <Opcoes opcoes={reps.map((r) => ({ valor: r.id, rotulo: r.nome }))} valor={rep} onChange={setRep} />
        </>
      )}
      <Campo rotulo="Resultado" value={resultado} onChangeText={setResultado} placeholder="Ex.: pedido fechado, retornar dia 20" />
      <Campo rotulo="Anotações" value={anotacoes} onChangeText={setAnotacoes} multiline />
      <Botao titulo="Salvar visita" onPress={salvar} />
    </ScrollView>
  );
}

/* ---------- Pedido (offline → rascunho no CRM) ---------- */

export function NovoPedido({ clienteId, voltar, alterou }: Nav & { clienteId: string }) {
  const c = useCores();
  const reps = useMemo(() => representadasDoCliente(clienteId), [clienteId]);
  const [rep, setRep] = useState<string | null>(reps.length === 1 ? reps[0]!.id : null);
  const [qtd, setQtd] = useState<Record<string, number>>({});
  const produtos = useMemo(() => (rep ? produtosDaRepresentada(rep) : []), [rep]);
  const itens = Object.entries(qtd).filter(([, q]) => q > 0).map(([produto_id, quantidade]) => ({ produto_id, quantidade }));
  const total = itens.reduce((t, i) => t + (produtos.find((p) => p.id === i.produto_id)?.preco ?? 0) * i.quantidade, 0);

  function salvar() {
    if (!rep || itens.length === 0) return Alert.alert("Escolha a representada e ao menos um item");
    registrarPedido({ cliente_id: clienteId, representada_id: rep, itens, forma_pagamento: null });
    alterou();
    voltar();
  }
  return (
    <ScrollView contentContainerStyle={s.tela} keyboardShouldPersistTaps="handled">
      <Titulo>Novo pedido</Titulo>
      {reps.length === 0 ? (
        <Suave>Cliente sem representada vinculada. Vincule no CRM web e sincronize.</Suave>
      ) : (
        <Opcoes opcoes={reps.map((r) => ({ valor: r.id, rotulo: r.nome }))} valor={rep} onChange={(v) => { setRep(v); setQtd({}); }} />
      )}
      {produtos.map((p) => (
        <Cartao key={p.id}>
          <Text style={{ color: c.texto, fontWeight: "600" }}>{p.nome}</Text>
          <Suave>{p.sku} · {moeda(p.preco)}{p.unidade ? ` / ${p.unidade}` : ""}</Suave>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <Botao titulo="−" variante="secundario" onPress={() => setQtd({ ...qtd, [p.id]: Math.max(0, (qtd[p.id] ?? 0) - 1) })} />
            <Text style={{ color: c.texto, fontSize: 18, minWidth: 32, textAlign: "center" }}>{qtd[p.id] ?? 0}</Text>
            <Botao titulo="+" variante="secundario" onPress={() => setQtd({ ...qtd, [p.id]: (qtd[p.id] ?? 0) + 1 })} />
          </View>
        </Cartao>
      ))}
      {rep && <Text style={{ color: c.texto, fontWeight: "700" }}>Total estimado: {moeda(total)}</Text>}
      <Suave>Preço final e comissão são calculados no CRM; o pedido chega como rascunho.</Suave>
      <Botao titulo="Salvar pedido" onPress={salvar} desabilitado={!rep || itens.length === 0} />
    </ScrollView>
  );
}
