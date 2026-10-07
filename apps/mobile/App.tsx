import NetInfo from "@react-native-community/netinfo";
import type { Session } from "@supabase/supabase-js";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, BackHandler, Pressable, Text, View } from "react-native";
import { API_URL, supabase } from "./src/config";
import { contarPendentes, lerMeta, migrar } from "./src/db";
import { sincronizar } from "./src/sync";
import { ClienteDetalhe, Clientes, Login, NovaVisita, NovoCliente, NovoPedido, type Rota } from "./src/telas";
import { dataHora, useCores } from "./src/ui";

migrar();

export default function App() {
  const c = useCores();
  const [sessao, setSessao] = useState<Session | null | undefined>(undefined);
  const [pilha, setPilha] = useState<Rota[]>([{ tela: "clientes" }]);
  const [versao, setVersao] = useState(0);
  const [online, setOnline] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const estavaOffline = useRef(false);

  const alterou = useCallback(() => setVersao((v) => v + 1), []);

  const sync = useCallback(async () => {
    setSincronizando(true);
    try {
      const r = await sincronizar();
      setAviso(r.rejeitados.length ? `${r.rejeitados.length} registro(s) com erro no sync` : null);
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "Falha ao sincronizar");
    } finally {
      setSincronizando(false);
      alterou();
    }
  }, [alterou]);

  // sessão (persistida no SQLite: o app abre offline depois do primeiro login)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSessao(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSessao(s));
    const app = AppState.addEventListener("change", (estado) => {
      if (estado === "active") supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    });
    return () => {
      data.subscription.unsubscribe();
      app.remove();
    };
  }, []);

  // fila de sync: dispara ao entrar e sempre que a conexão volta
  useEffect(() => {
    if (!sessao) return;
    const parar = NetInfo.addEventListener((st) => {
      const conectado = Boolean(st.isConnected) && st.isInternetReachable !== false;
      setOnline(conectado);
      if (conectado && estavaOffline.current) void sync();
      estavaOffline.current = !conectado;
    });
    void sync();
    return parar;
  }, [sessao, sync]);

  const voltar = useCallback(() => setPilha((p) => (p.length > 1 ? p.slice(0, -1) : p)), []);
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (pilha.length > 1) {
        voltar();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [pilha.length, voltar]);

  if (sessao === undefined) {
    return <View style={{ flex: 1, justifyContent: "center", backgroundColor: c.bg }}><ActivityIndicator /></View>;
  }
  if (!sessao) {
    return <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: 48 }}><StatusBar style="auto" /><Login /></View>;
  }

  const rota = pilha[pilha.length - 1]!;
  const nav = { ir: (r: Rota) => setPilha((p) => [...p, r]), voltar, alterou: () => { alterou(); if (online) void sync(); }, versao };
  const pendentes = contarPendentes();
  const ultimo = lerMeta("ultimo_sync");

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: 44 }}>
      <StatusBar style="auto" />
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 8, gap: 12 }}>
        {pilha.length > 1 && (
          <Pressable onPress={voltar} accessibilityRole="button" accessibilityLabel="Voltar">
            <Text style={{ color: c.primaria, fontSize: 16 }}>‹ Voltar</Text>
          </Pressable>
        )}
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => void sync()} disabled={sincronizando || !online} accessibilityRole="button" accessibilityLabel="Sincronizar">
          <Text style={{ color: online ? c.primaria : c.aviso, fontWeight: "600" }}>
            {sincronizando ? "Sincronizando…" : online ? `⟳ Sincronizar${pendentes ? ` (${pendentes})` : ""}` : `Offline · ${pendentes} pendente(s)`}
          </Text>
        </Pressable>
        <Pressable onPress={() => void supabase.auth.signOut()} accessibilityRole="button">
          <Text style={{ color: c.suave }}>Sair</Text>
        </Pressable>
      </View>
      {(aviso || !API_URL) && (
        <Text style={{ color: c.perigo, paddingHorizontal: 16 }}>{!API_URL ? "Configure EXPO_PUBLIC_API_URL para sincronizar." : aviso}</Text>
      )}
      {ultimo && <Text style={{ color: c.suave, paddingHorizontal: 16, fontSize: 12 }}>Último sync: {dataHora(ultimo)}</Text>}

      {rota.tela === "clientes" && <Clientes {...nav} />}
      {rota.tela === "novoCliente" && <NovoCliente {...nav} />}
      {rota.tela === "cliente" && <ClienteDetalhe {...nav} id={rota.id} />}
      {rota.tela === "visita" && <NovaVisita {...nav} clienteId={rota.clienteId} />}
      {rota.tela === "pedido" && <NovoPedido {...nav} clienteId={rota.clienteId} />}
    </View>
  );
}
