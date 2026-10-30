# Contrato da API (login com Google e preferências)

> **Estado:** o login está implementado e testado com o Google simulado, mas **desativado por padrão**: com `GOOGLE_CLIENT_ID` vazio em `src/shared/auth.js`, o popup esconde o cartão de conta. Basta preencher o Client ID (passos em "Configuração") para ativá-lo.

Backend em Node.js + SQLite, em repositório separado: https://github.com/MadureiraHenrique/HoverVoice-backend (privado). Todas as rotas falam JSON. Fora de `localhost`, só HTTPS.

## Autenticação

1. A extensão abre o login do Google com `chrome.identity.launchWebAuthFlow` (`response_type=id_token`, `scope=openid email`, com um `nonce` aleatório) e recebe um **ID token**.
2. `POST /auth/google` envia o ID token e o nonce. O backend confere assinatura (chaves públicas do Google), emissor, `aud` (Client ID), validade, nonce e e-mail verificado.
3. Na primeira vez a conta é criada; nas seguintes, apenas se entra. A resposta traz um **token de sessão** (30 dias) que a extensão guarda em `chrome.storage.local`, chave `authSession` (`{ token, email }`). O servidor guarda só o hash do token.
4. As demais rotas usam `Authorization: Bearer <token>`. Resposta `401` significa sessão inválida ou expirada: a extensão apaga a sessão e pede novo login.

## Rotas

| Rota | Corpo | Sucesso | Erros |
|---|---|---|---|
| `POST /auth/google` | `{ "idToken": string, "nonce": string }` | `200 { token, user: { email }, preferences: {…} \| null }` | `401` token inválido |
| `POST /auth/logout` | — | `200 { ok: true }` | `401` |
| `GET /preferences` | — | `200 { preferences: {…} \| null }` | `401` |
| `PUT /preferences` | `{ voiceRate, voicePitch, voiceVolume }` | `200 { preferences }` | `400` fora da faixa, `401` |
| `GET /health` | — | `200 { ok: true }` | — |

Faixas: `voiceRate` e `voicePitch` de 0,5 a 2; `voiceVolume` de 0 a 1. Só esses três campos são sincronizados (`enabled`, `language` e `pdfAutoOpen` ficam locais).

## Regras de sincronização

- **Ao entrar:** se a conta já tem preferências, elas substituem as locais; se a conta é nova, as locais são enviadas.
- **Ao abrir o popup logado:** a conta é a fonte dos campos sincronizados.
- **Ao soltar um controle de voz (evento `change`):** a extensão envia as três preferências.
- **Sem internet ou servidor fora do ar:** a extensão segue funcionando com as preferências locais e avisa que elas ficaram só neste navegador.

## Configuração (uma vez)

1. No Google Cloud Console, crie um projeto, configure a tela de consentimento OAuth e um cliente OAuth do tipo **Aplicativo da Web**.
2. Em "URIs de redirecionamento autorizados", adicione `https://<ID DA EXTENSÃO>.chromiumapp.org/` (o ID aparece em `chrome://extensions`). Para o ID não mudar entre máquinas, fixe-o com o campo `key` do `manifest.json`.
3. Coloque o Client ID em `GOOGLE_CLIENT_ID` no `src/shared/auth.js` (não é segredo) e a URL do backend em `API_BASE_URL`.
4. Suba o backend com `GOOGLE_CLIENT_ID` e `EXTENSION_ORIGIN=chrome-extension://<ID DA EXTENSÃO>` (veja o README do backend).
