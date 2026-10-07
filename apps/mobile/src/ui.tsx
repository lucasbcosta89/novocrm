import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, TextInput, useColorScheme, View, type TextInputProps } from "react-native";

const CLARO = { bg: "#f6f7f9", card: "#ffffff", texto: "#1a1d23", suave: "#5f6672", borda: "#e2e5ea", primaria: "#1f5eff", perigo: "#c62828", ok: "#2e7d32", aviso: "#b26a00" };
const ESCURO = { bg: "#111318", card: "#1a1d23", texto: "#e8eaee", suave: "#9aa1ad", borda: "#2b2f37", primaria: "#5b8cff", perigo: "#ff6b6b", ok: "#66bb6a", aviso: "#ffb74d" };
export type Cores = typeof CLARO;

export function useCores(): Cores {
  return useColorScheme() === "dark" ? ESCURO : CLARO;
}

export function Botao({ titulo, onPress, variante = "primario", desabilitado }: {
  titulo: string; onPress: () => void; variante?: "primario" | "secundario"; desabilitado?: boolean;
}) {
  const c = useCores();
  const primario = variante === "primario";
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={desabilitado}
      style={({ pressed }) => [
        s.botao,
        { backgroundColor: primario ? c.primaria : "transparent", borderColor: c.primaria, opacity: desabilitado ? 0.5 : pressed ? 0.8 : 1 },
      ]}
    >
      <Text style={{ color: primario ? "#fff" : c.primaria, fontWeight: "600", fontSize: 16 }}>{titulo}</Text>
    </Pressable>
  );
}

export function Campo({ rotulo, ...props }: { rotulo: string } & TextInputProps) {
  const c = useCores();
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: c.suave, fontSize: 13 }}>{rotulo}</Text>
      <TextInput
        placeholderTextColor={c.suave}
        {...props}
        style={[s.input, { color: c.texto, borderColor: c.borda, backgroundColor: c.card }, props.multiline && { minHeight: 80, textAlignVertical: "top" }]}
      />
    </View>
  );
}

export function Cartao({ children }: { children: ReactNode }) {
  const c = useCores();
  return <View style={[s.cartao, { backgroundColor: c.card, borderColor: c.borda }]}>{children}</View>;
}

export function Titulo({ children }: { children: ReactNode }) {
  const c = useCores();
  return <Text style={{ color: c.texto, fontSize: 18, fontWeight: "700" }}>{children}</Text>;
}

export function Suave({ children }: { children: ReactNode }) {
  const c = useCores();
  return <Text style={{ color: c.suave, fontSize: 13 }}>{children}</Text>;
}

export function Selo({ status }: { status: string }) {
  const c = useCores();
  const cor = status === "pendente" ? c.aviso : status === "erro" ? c.perigo : c.ok;
  const rotulo = status === "pendente" ? "aguardando sync" : status === "erro" ? "erro no sync" : "sincronizado";
  return <Text style={{ color: cor, fontSize: 12, fontWeight: "600" }}>● {rotulo}</Text>;
}

/** Opções em linha (substitui um select). */
export function Opcoes<T extends string>({ opcoes, valor, onChange }: { opcoes: { valor: T; rotulo: string }[]; valor: T | null; onChange: (v: T) => void }) {
  const c = useCores();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {opcoes.map((o) => {
        const ativo = o.valor === valor;
        return (
          <Pressable key={o.valor} onPress={() => onChange(o.valor)} accessibilityRole="radio" accessibilityState={{ selected: ativo }}
            style={[s.chip, { borderColor: ativo ? c.primaria : c.borda, backgroundColor: ativo ? c.primaria : c.card }]}>
            <Text style={{ color: ativo ? "#fff" : c.texto }}>{o.rotulo}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const moeda = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
export const dataHora = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(iso));

export const s = StyleSheet.create({
  botao: { borderWidth: 1, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16, alignItems: "center" },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  cartao: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 6 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  tela: { padding: 16, gap: 12 },
});
