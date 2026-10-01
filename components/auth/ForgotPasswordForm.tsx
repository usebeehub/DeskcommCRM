"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTransition, useState } from "react";

import { useT } from "@/hooks/i18n/useT";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/lib/auth/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset } from "@/app/actions/auth/requestPasswordReset";
import { Captcha } from "@/components/auth/Captcha";

export function ForgotPasswordForm({
  captchaChave,
}: {
  /** Chave pública do captcha; `null`/ausente = instalação sem captcha. */
  captchaChave?: string | null;
} = {}) {
  const t = useT();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [rodadaDoCaptcha, setRodadaDoCaptcha] = useState(0);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = (values: ForgotPasswordInput) => {
    setServerError(null);
    if (captchaChave && !captchaToken) {
      setServerError(t("Aguarde a verificação de segurança terminar e tente de novo."));
      return;
    }
    startTransition(async () => {
      const res = await requestPasswordReset(values, captchaToken ?? undefined);
      if (res.ok) {
        setSent(true);
        return;
      }
      // O token foi gasto nesta chamada; a próxima tentativa precisa de outro.
      setCaptchaToken(null);
      setRodadaDoCaptcha((n) => n + 1);
      if (res.error === "captcha_failed") {
        setServerError(t("A verificação de segurança expirou. Confirme de novo e tente outra vez."));
      } else if (res.error === "rate_limited") {
        setServerError(t("Muitas tentativas. Aguarde alguns minutos."));
      } else if (res.error === "validation_error") {
        setServerError(t("Email inválido. Confira o campo."));
      } else {
        setServerError(t("Não foi possível enviar o e-mail. Tente novamente."));
      }
    });
  };

  if (sent) {
    return (
      <div
        className="space-y-2 rounded-md border bg-muted/40 px-4 py-6 text-center"
        role="status"
      >
        <p className="text-sm font-medium">{t("Verifique seu e-mail")}</p>
        <p className="text-sm text-muted-foreground">
          {t("Se existir uma conta com esse e-mail, enviamos um link para redefinir a senha.")}
        </p>
      </div>
    );
  }

  return (
    <form method="post" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          autoFocus
          aria-invalid={errors.email ? true : undefined}
          {...register("email")}
        />
        {errors.email && (
          <p className="text-xs text-destructive">{t(errors.email.message ?? "")}</p>
        )}
      </div>
      {captchaChave && (
        <Captcha key={rodadaDoCaptcha} chave={captchaChave} onToken={setCaptchaToken} />
      )}
      {serverError && (
        <div
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {serverError}
        </div>
      )}
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? t("Enviando...") : t("Enviar link de redefinição")}
      </Button>
    </form>
  );
}
