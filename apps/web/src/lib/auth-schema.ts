import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("E-mail inválido")),
  senha: z.string().min(8, "Senha deve ter ao menos 8 caracteres"),
});

export const signupSchema = loginSchema.extend({
  nome: z.string().trim().min(2, "Informe seu nome").max(120),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;

export function primeiroErro(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Dados inválidos";
}
