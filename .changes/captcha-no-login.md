---
impacto: capacidade_nova
secao: adicionado
titulo: Captcha opcional no login, no cadastro e no "esqueci a senha"
---
A instalação pode pôr um captcha (Cloudflare Turnstile, que tem plano grátis) nas três telas públicas de entrada. Quem não configurar nada não vê diferença. Para ligar: crie o widget no painel da Cloudflare com o domínio do CRM, ponha a chave do site em `TURNSTILE_SITE_KEY` no `.env` do app e reinicie; só depois ligue o captcha no provedor de auth (no Supabase: Authentication › Attack Protection, com a chave secreta). Nessa ordem: com o captcha ligado no provedor e sem a chave no app, ninguém consegue entrar com senha. A entrada com o Google não usa captcha.
