/**
 * Captcha nas portas públicas do GoTrue (login, cadastro, "esqueci a senha" e
 * o reenvio do e-mail de confirmação do convite).
 *
 * ─── Por que a defesa mora no PROVEDOR e não aqui ───────────────────────────
 *
 * O teto de tentativas do app (`lib/auth/rate-limit.ts`, issue #64) só vê quem
 * passa pelas server actions. A anon key vai para o browser — é pública por
 * desenho —, então qualquer um chama `POST {SUPABASE_URL}/auth/v1/token` direto
 * e o teto nem fica sabendo. O captcha do GoTrue (Supabase › Authentication ›
 * Attack Protection, ou `GOTRUE_SECURITY_CAPTCHA_*` no self-host) fecha essa
 * porta no lugar certo. O app só repassa o token que o widget gerou.
 *
 * ─── Por que a chave do widget é variável de RUNTIME ────────────────────────
 *
 * `NEXT_PUBLIC_*` é congelada no `next build`, e a imagem é uma só para todas
 * as instalações (ver "Marca própria" no CLAUDE.md). A chave do site é lida no
 * servidor, a cada requisição, e desce como prop para o formulário.
 *
 * Sem `TURNSTILE_SITE_KEY` nada muda: nenhum widget, nenhum token, chamadas
 * idênticas às de antes. A ordem de ligar importa — primeiro a chave aqui,
 * depois o captcha no provedor. Ao contrário, o GoTrue recusa todo login por
 * senha até a chave chegar.
 */
import { env } from "@/lib/env";

/** Turnstile devolve tokens de ~2 KB; acima disto não é token, é lixo. */
const TAMANHO_MAXIMO_DO_TOKEN = 4096;

/** A chave pública do widget (Cloudflare Turnstile), ou `null` sem captcha. */
export function chaveDoCaptcha(): string | null {
  const chave = env.TURNSTILE_SITE_KEY.trim();
  return chave === "" ? null : chave;
}

/**
 * As opções da chamada ao GoTrue com o token, quando há token. Sem token o
 * objeto volta intacto — instalação sem captcha manda exatamente o que mandava.
 */
export function comCaptcha<T extends object>(opcoes: T, token: string | undefined | null): T {
  const t = typeof token === "string" ? token.trim() : "";
  if (t === "" || t.length > TAMANHO_MAXIMO_DO_TOKEN) return opcoes;
  return { ...opcoes, captchaToken: t };
}

/**
 * O GoTrue recusou por captcha (token ausente, vencido ou já usado)?
 * `captcha_failed` é o código das versões atuais; as anteriores só diziam na
 * mensagem.
 */
export function ehRecusaDeCaptcha(
  erro: { message?: string; code?: string; status?: number } | null | undefined,
): boolean {
  if (!erro) return false;
  if (erro.code === "captcha_failed") return true;
  return /captcha/i.test(erro.message ?? "");
}
