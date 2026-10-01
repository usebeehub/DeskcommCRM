"use client";

/**
 * O widget de captcha (Cloudflare Turnstile) dos formulários públicos de auth.
 *
 * Só aparece quando a instalação declara `TURNSTILE_SITE_KEY` — a página lê a
 * chave no servidor (`chaveDoCaptcha()`) e passa como prop; sem chave, quem usa
 * este componente nem o monta. Quem valida o token é o provedor de auth, não o
 * app: ver `lib/auth/captcha.ts`.
 *
 * Cada token vale UMA chamada ao GoTrue. Depois de qualquer resposta que não
 * tirou a pessoa da tela, o formulário troca a `key` deste componente: o widget
 * remonta e gera outro token — senão a segunda tentativa iria com token gasto e
 * voltaria recusada. (Remontar em vez de expor um `reset()` por ref: a ref
 * dentro do `onSubmit` cai na regra `react-hooks/refs`, e o script do widget
 * fica em cache, então remontar é barato.)
 */
import { useEffect, useRef, useState } from "react";

import { useT } from "@/hooks/i18n/useT";

const URL_DO_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type Turnstile = {
  render: (caixa: HTMLElement, opcoes: Record<string, unknown>) => string;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let carregando: Promise<Turnstile> | null = null;

/** Um `<script>` só por página, mesmo com o widget montando e desmontando. */
function carregarTurnstile(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!carregando) {
    carregando = new Promise<Turnstile>((resolver, recusar) => {
      const script = document.createElement("script");
      script.src = URL_DO_SCRIPT;
      script.async = true;
      script.onload = () =>
        window.turnstile ? resolver(window.turnstile) : recusar(new Error("turnstile ausente"));
      script.onerror = () => {
        carregando = null; // deixa a próxima montagem tentar de novo
        recusar(new Error("script do captcha não carregou"));
      };
      document.head.appendChild(script);
    });
  }
  return carregando;
}

export function Captcha({
  chave,
  onToken,
}: {
  chave: string;
  /** Token novo, ou `null` quando o anterior venceu ou o widget falhou. */
  onToken: (token: string | null) => void;
}) {
  const t = useT();
  const caixa = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const aoToken = useRef(onToken);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    aoToken.current = onToken;
  }, [onToken]);

  useEffect(() => {
    let montado = true;
    carregarTurnstile()
      .then((turnstile) => {
        if (!montado || !caixa.current) return;
        widget.current = turnstile.render(caixa.current, {
          sitekey: chave,
          size: "flexible",
          callback: (token: string) => aoToken.current(token),
          "expired-callback": () => aoToken.current(null),
          "error-callback": () => aoToken.current(null),
        });
      })
      .catch(() => {
        if (!montado) return;
        setFalhou(true);
        aoToken.current(null);
      });
    return () => {
      montado = false;
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, [chave]);

  if (falhou) {
    return (
      <p className="text-xs text-destructive" role="alert">
        {t("Não foi possível carregar a verificação de segurança. Recarregue a página.")}
      </p>
    );
  }
  // A altura reservada evita o formulário pular quando o widget aparece.
  return <div ref={caixa} className="min-h-[65px]" />;
}
