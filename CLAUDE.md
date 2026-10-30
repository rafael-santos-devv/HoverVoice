# HoverVoice

Extensão de navegador (Chrome/Edge, Manifest V3) de acessibilidade para pessoas com deficiência visual: narra o conteúdo de páginas web, e de PDFs abertos em um leitor próprio, ao passar o mouse ou navegar com `Tab`. Projeto integrador do Programa Full Stack (Petrobras / SENAI Dendezeiros). Idioma do produto e da documentação: português (Brasil).

## Como trabalhar neste projeto

1. No início de cada sessão, leia o `TASKS.md` e siga a seção **Important Tasks**.
2. Faça **uma tarefa por vez**, na ordem do `TASKS.md`. Ao terminar, mova-a para "Concluído" marcando ✅.
3. Em dúvida entre duas abordagens que mudam o produto, pergunte antes de implementar.

## Stack e restrições

- JavaScript puro (ES2022). **Sem build, sem bundler, sem `package.json`, sem frameworks.** Não adicione React nem dependências npm.
- A extensão é carregada "sem compactação" (`chrome://extensions` → Modo de desenvolvedor → pasta do projeto). Depois de editar, recarregue a extensão e a página de teste.
- `lib/` contém o PDF.js de terceiros. **Não edite nada em `lib/`.**
- Permissões do `manifest.json` (`storage`, `activeTab`, `webRequest`, `identity`, `<all_urls>`): não amplie sem necessidade e documente o motivo. `identity` existe só para o login opcional com Google (`chrome.identity.launchWebAuthFlow`).
- Todo texto visível ou falado vem de `HoverVoiceI18n.t()` (pt, en, es); o português é o idioma de referência e o de reserva. Só `manifest.json` (nome e descrição) fica em português. O content script nunca altera o `lang` de páginas de terceiros.

## Arquivos e responsabilidades

| Arquivo | Papel |
|---|---|
| `manifest.json` | Configuração, permissões e atalhos (`Alt+A` ativa/desativa, `Alt+P` abre PDF no leitor) |
| `src/shared/state.js` | Script comum que publica o global `HoverVoice` (`STORAGE_KEY`, `DEFAULT_STATE`, faixas de voz, `clamp`, `readState`, `writeState`, `stateFromChange`). Carregado antes de todos os demais |
| `src/shared/i18n.js` | Script comum que publica `HoverVoiceI18n`: textos em pt, en e es (`MESSAGES`), `t(chave, params)`, `apply()` (atributos `data-i18n` e `data-i18n-attr`). Todo texto novo entra aqui nos três idiomas |
| `src/shared/voice.js` | Script comum que publica `HoverVoiceVoice`: idioma da fala (fixo ou `lang` da página), lista e escolha de vozes, `createUtterance`. Narração e teste de voz usam só ele |
| `src/shared/auth.js` | Script comum que publica `HoverVoiceAuth`: login com Google, sessão (`authSession`) e sincronização das preferências de voz com o backend. Só o popup o usa. Contrato em `docs/api-contrato.md` |
| `src/background/background.js` | Service worker: estado padrão, atalhos, detecção e redirecionamento de PDFs |
| `src/content/content.js` | Roda em cada página (e no `viewer.html`): captura o elemento sob o cursor/foco e narra via Web Speech API |
| `src/popup/popup.html/css/js` | Interface da extensão: ativar, testar voz, velocidade/tom/volume, abrir PDFs no leitor |
| `src/viewer/viewer.html/css/js` | Leitor de PDF (módulo ES) que desenha páginas com PDF.js e sobrepõe blocos narráveis |
| `src/viewer/pdf-blocks.js` | Módulo puro (sem DOM): agrupa fragmentos de texto do PDF em parágrafos |
| `TESTE.html`, `exemplos/` | Página e PDFs para teste manual |
| `docs/` | Documentos do projeto (PDF) |

## Arquitetura (o que não pode quebrar)

- **`chrome.storage.local`, chave `extensionState`, é a única fonte de verdade.** Popup, background e content script apenas leem e gravam esse objeto e reagem a `chrome.storage.onChanged`. Não crie troca manual de mensagens para propagar configurações.
- **Delegação de eventos no `content.js`:** dois listeners no `document` (`pointerover` e `focusin`), alvo resolvido com `Element.closest(NARRATABLE_SELECTOR)`. Não registre listeners por elemento nem use `MutationObserver`.
- O leitor de PDF existe porque o visualizador nativo do Chrome é isolado. Cada parágrafo vira um elemento `.bloco-pdf`, que o `content.js` já sabe narrar; não duplique a lógica de narração no `viewer.js`.
- `content.js` é script comum (não pode usar `import`); `viewer.js` e `pdf-blocks.js` são módulos. Qualquer código compartilhado entre eles precisa respeitar essa diferença.
- Código compartilhado entre contextos vive em `src/shared/` como script comum (sem `import`) que publica o global `HoverVoice`. Cada contexto o carrega antes de si: `manifest.json` (`content_scripts`), `<script>` no popup e no `viewer.html`, `importScripts()` no service worker. Novo código compartilhado entra nesse namespace, não em cópias.

## Convenções de código

- Indentação de 4 espaços; `const` por padrão; `camelCase` em inglês para nomes.
- Comentários em português, **só quando explicam o porquê** (regra de negócio, restrição do navegador, armadilha). Não comente o que o código já diz.
- Classes CSS injetadas em páginas de terceiros usam o prefixo `hovervoice-`. Estilos do popup usam as variáveis `--cor-*` de `popup.css`.
- Os comentários citam requisitos (`RF-xx`, `RN-xx`, `RNF-xx`). Preserve essas referências ao refatorar.
- Acessibilidade é requisito do produto: HTML semântico, `aria-*`, foco visível, contraste alto, sem `alert()`. Animações devem respeitar `prefers-reduced-motion`.

## Validação (a cada mudança)

Não há suíte de testes automatizados. Antes de dar uma tarefa como concluída:

1. `node --check` em cada `.js` alterado e conferir que `manifest.json` e `config.json` continuam JSON válido.
2. Recarregar a extensão e abrir o popup (sem erros no console da página de service worker).
3. Testar em `TESTE.html`: narração por mouse e por `Tab`, `Alt+A`, ajustes de voz e persistência.
4. Se mexeu em PDF: abrir `exemplos/relatorio-exemplo.pdf` e `exemplos/duas-colunas-exemplo.pdf` no leitor e conferir a narração.
5. Se algo falhar, corrigir e repetir o teste antes de seguir.

Se não for possível rodar o navegador, diga claramente o que foi e o que não foi testado.

## Git

- Repositório: `https://github.com/rafael-santos-devv/HoverVoice.git`. Confirme com `git remote -v` e `git status` antes de começar.
- Trabalhe em uma branch por tarefa (ex.: `feat/redesign-popup`), nunca direto na `main`. Faça `push` da branch; o merge na `main` é feito pelo dono.
- Separe as mudanças em commits pequenos, um assunto por commit, mensagens em português no imperativo (ex.: `Extrai estado padrão para módulo compartilhado`).
- O autor é o usuário global do git da máquina (`git config user.name` / `user.email`). Não altere a configuração e **não adicione linhas `Co-authored-by`**.
- Nunca faça `push --force`, nunca commite segredos, chaves ou arquivos `.env`.

## Skills

- `vercel-labs/skills@find-skills` e `imskyleen/animate-ui` foram escolhidas pelo dono do projeto. Instalação (uma vez, no terminal): `npx skills add vercel-labs/skills@find-skills -a claude-code` e `npx skills add imskyleen/animate-ui`.
- Ao usar o `find-skills`: **liste as opções e peça confirmação antes de instalar qualquer skill**. Não use `-g` nem `-y` por conta própria.
- `animate-ui` é referência visual de animações. O projeto não usa React: reproduza o efeito em CSS/JS puro, sem adicionar React ou build.

## Figma e login (decisões já tomadas)

- O Figma está conectado por MCP. Arquivo: `https://www.figma.com/design/VkEoAoAWapcuyIX7WpGqhy?node-id=13-2` (fileKey `VkEoAoAWapcuyIX7WpGqhy`, nó `13:2`). O design vem antes do código: crie a tela no Figma, mostre ao dono e **só comece o código depois da aprovação**.
- O login é **opcional**, só com Google, e usa um **backend próprio** em Node.js + SQLite, em repositório separado (`../HoverVoice-backend`; contrato em `docs/api-contrato.md`). A extensão nunca guarda senha, nem mantém chaves ou segredos no código; guarde apenas o token de sessão em `chrome.storage.local`. Toda comunicação com o backend deve usar HTTPS.
- Sem login, a extensão continua funcionando como hoje, com preferências locais. O login só habilita salvar e sincronizar preferências.
