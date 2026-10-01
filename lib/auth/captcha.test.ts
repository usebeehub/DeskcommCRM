import { describe, expect, it } from "vitest";

import { comCaptcha, ehRecusaDeCaptcha } from "./captcha";

describe("ehRecusaDeCaptcha", () => {
  it("reconhece o código do GoTrue atual", () => {
    expect(ehRecusaDeCaptcha({ message: "qualquer", code: "captcha_failed" })).toBe(true);
  });

  it("reconhece a mensagem de versões que ainda não mandam código", () => {
    expect(
      ehRecusaDeCaptcha({
        message: "captcha protection: request disallowed (no captcha response)",
      }),
    ).toBe(true);
  });

  it("senha errada, 429 e erro vazio não são captcha", () => {
    expect(
      ehRecusaDeCaptcha({ message: "Invalid login credentials", code: "invalid_credentials" }),
    ).toBe(false);
    expect(ehRecusaDeCaptcha({ message: "rate limit exceeded", status: 429 })).toBe(false);
    expect(ehRecusaDeCaptcha(null)).toBe(false);
  });
});

describe("comCaptcha", () => {
  it("acrescenta o token quando ele existe", () => {
    expect(comCaptcha({ emailRedirectTo: "x" }, "tok")).toEqual({
      emailRedirectTo: "x",
      captchaToken: "tok",
    });
  });

  it("sem token (ou só espaço), devolve as opções intactas", () => {
    expect(comCaptcha({ emailRedirectTo: "x" }, undefined)).toEqual({ emailRedirectTo: "x" });
    expect(comCaptcha({ emailRedirectTo: "x" }, "  ")).toEqual({ emailRedirectTo: "x" });
  });

  it("token absurdo de grande não sai do app", () => {
    expect(comCaptcha({}, "a".repeat(5000))).toEqual({});
  });
});
