/**
 * Captcha nas três portas públicas do GoTrue: login, cadastro e "esqueci a senha".
 *
 * Com o captcha ligado no provedor (Supabase › Attack Protection, ou
 * `GOTRUE_SECURITY_CAPTCHA_*` no self-host), o GoTrue recusa essas chamadas sem
 * `captchaToken`. O teto de tentativas do app (issue #64) não cobre quem fala
 * DIRETO com o GoTrue usando a anon key, que é pública — por isso a defesa
 * mora no provedor, e o app só precisa repassar o token que o widget gerou.
 *
 * O que este arquivo prova:
 *   - com token, ele chega ao provedor em `options.captchaToken`;
 *   - sem token, a chamada sai IGUAL à de antes (instalação sem captcha não muda);
 *   - recusa de captcha vira `captcha_failed`, e no login NÃO gasta o
 *     orçamento de senha errada da conta.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

const admin = vi.hoisted(() => ({ createUser: vi.fn(), deleteUser: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    auth: { admin: { createUser: admin.createUser, deleteUser: admin.deleteUser } },
  })),
}));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/auth/politica-de-cadastro", () => ({ modoDeCadastro: vi.fn(async () => "aberto") }));
vi.mock("@/lib/audit", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  audit: vi.fn(async () => undefined),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

/** A forma que o GoTrue devolve quando o token falta ou não vale. */
const RECUSA_DE_CAPTCHA = {
  message: "captcha protection: request disallowed (no captcha response)",
  status: 400,
  code: "captcha_failed",
};

const provedor = {
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  resend: vi.fn(),
  mfa: { listFactors: vi.fn(async () => ({ data: { totp: [] } })) },
};

let n = 0;
const unico = () => `${++n}-${Date.now()}`;

beforeEach(() => {
  vi.resetModules();
  for (const f of [
    provedor.signInWithPassword,
    provedor.signUp,
    provedor.resetPasswordForEmail,
    provedor.resend,
  ]) {
    f.mockReset();
  }
  vi.mocked(headers).mockResolvedValue({
    get: (k: string) => (k === "x-forwarded-for" ? `192.0.2.${n % 250}` : null),
  } as never);
  vi.mocked(createClient).mockResolvedValue({ auth: provedor } as never);
});

describe("login com captcha", () => {
  it("repassa o token ao provedor", async () => {
    provedor.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Invalid login credentials", status: 400 },
    });
    const { signInWithPassword } = await import("./signInWithPassword");
    await signInWithPassword(
      { email: `a-${unico()}@exemplo.test`, password: "senha-qualquer-1" },
      undefined,
      "tok-123",
    );
    expect(provedor.signInWithPassword).toHaveBeenCalledWith(
      expect.objectContaining({ options: { captchaToken: "tok-123" } }),
    );
  });

  it("sem token, a chamada sai como antes (sem options)", async () => {
    provedor.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Invalid login credentials", status: 400 },
    });
    const { signInWithPassword } = await import("./signInWithPassword");
    const email = `b-${unico()}@exemplo.test`;
    await signInWithPassword({ email, password: "senha-qualquer-1" });
    expect(provedor.signInWithPassword.mock.calls[0]?.[0]).toEqual({
      email,
      password: "senha-qualquer-1",
    });
  });

  it("recusa de captcha vira captcha_failed e não conta como senha errada", async () => {
    provedor.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: RECUSA_DE_CAPTCHA,
    });
    const { signInWithPassword } = await import("./signInWithPassword");
    const input = { email: `c-${unico()}@exemplo.test`, password: "senha-qualquer-1" };

    // AUTH_LIMITS.login.id = 5: se a recusa de captcha gastasse o orçamento,
    // a 6ª tentativa voltaria rate_limited.
    const resultados = [];
    for (let i = 0; i < 6; i++) resultados.push(await signInWithPassword(input));
    expect(resultados.map((r) => r?.error)).toEqual(Array(6).fill("captcha_failed"));
  });
});

describe("cadastro com captcha", () => {
  const entrada = () => ({
    org_name: "Loja Teste",
    email: `cad-${unico()}@exemplo.test`,
    password: "SenhaForte!2026",
    password_confirm: "SenhaForte!2026",
  });

  it("repassa o token ao provedor", async () => {
    provedor.signUp.mockResolvedValue({ data: { user: { id: "u1" }, session: null }, error: null });
    const { signUp } = await import("./signUp");
    await signUp(entrada(), undefined, "tok-cad");
    expect(provedor.signUp.mock.calls[0]?.[0].options.captchaToken).toBe("tok-cad");
  });

  it("sem token, options não ganha captchaToken", async () => {
    provedor.signUp.mockResolvedValue({ data: { user: { id: "u1" }, session: null }, error: null });
    const { signUp } = await import("./signUp");
    await signUp(entrada());
    expect(provedor.signUp.mock.calls[0]?.[0].options).not.toHaveProperty("captchaToken");
  });

  it("recusa de captcha vira captcha_failed", async () => {
    provedor.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: RECUSA_DE_CAPTCHA,
    });
    const { signUp } = await import("./signUp");
    expect(await signUp(entrada(), undefined, "tok-velho")).toMatchObject({
      ok: false,
      error: "captcha_failed",
    });
  });
});

describe("esqueci a senha com captcha", () => {
  it("repassa o token ao provedor", async () => {
    provedor.resetPasswordForEmail.mockResolvedValue({ error: null });
    const { requestPasswordReset } = await import("./requestPasswordReset");
    await requestPasswordReset({ email: `r-${unico()}@exemplo.test` }, "tok-reset");
    expect(provedor.resetPasswordForEmail.mock.calls[0]?.[1]).toMatchObject({
      captchaToken: "tok-reset",
    });
  });

  it("sem token, options não ganha captchaToken", async () => {
    provedor.resetPasswordForEmail.mockResolvedValue({ error: null });
    const { requestPasswordReset } = await import("./requestPasswordReset");
    await requestPasswordReset({ email: `s-${unico()}@exemplo.test` });
    expect(provedor.resetPasswordForEmail.mock.calls[0]?.[1]).not.toHaveProperty("captchaToken");
  });

  it("recusa de captcha vira captcha_failed", async () => {
    provedor.resetPasswordForEmail.mockResolvedValue({ error: RECUSA_DE_CAPTCHA });
    const { requestPasswordReset } = await import("./requestPasswordReset");
    expect(await requestPasswordReset({ email: `t-${unico()}@exemplo.test` }, "x")).toEqual({
      ok: false,
      error: "captcha_failed",
    });
  });
});
