# TASKS — HoverVoice

Quadro Kanban do projeto. Mova cada tarefa entre as colunas e marque ✅ ao concluir. Uma tarefa por vez.

## Important Tasks

Valem para **cada** tarefa deste quadro. Antes de começar e ao terminar, confira tudo desta seção.

- Procure skills para a tarefa que vai começar, com `vercel-labs/skills@find-skills`. O objetivo é um bom design na aplicação e boa legibilidade de código. **Liste as opções e peça confirmação antes de instalar qualquer skill** (sem `-g`).
- Valide, teste e corrija a cada mudança, seguindo a seção "Validação" do `CLAUDE.md`. Só marque ✅ depois que o teste passar.
- Separe as mudanças em commits pequenos, em uma branch por tarefa, e envie a branch para o repositório `https://github.com/rafael-santos-devv/HoverVoice.git`. O autor é o usuário global do git da máquina. O merge na `main` fica com o dono.
- Atualize este quadro ao iniciar (A fazer → Em andamento) e ao concluir (Em andamento → Concluído ✅).

## Em andamento

_(nenhuma)_

## A fazer

Inclua no .gitignore os .md, menos o README.md

### 4. Tela de login e preferências salvas
Usuários que criarem login poderão salvar suas preferências de voz (velocidade, tom, volume e demais ajustes) e recuperá-las em outro navegador.
- [x] **Decisões do dono:** login e registro são **opcionais** e **minimalistas**; autenticação **só com Google** (entrar e criar conta são o mesmo fluxo); as preferências sincronizadas são velocidade, tom e volume (não existe "intensidade"). Sem e-mail/senha, logo sem "recuperar senha".
- [x] Backend: Node.js + SQLite, sem dependências, em `../HoverVoice-backend` (repositório git local, 5 testes passando). **Pendente do dono:** criar o cliente OAuth no Google Cloud (passos em `docs/api-contrato.md`), preencher `GOOGLE_CLIENT_ID`/`API_BASE_URL` em `src/shared/auth.js` e escolher a hospedagem com HTTPS.
- [x] Desenhar a tela de login no Figma (seção "Login com Google · proposta", nó `51:12`): convite, entrada, carregando, erro e logado. **Aguardando aprovação do design.**
- [x] Contrato da API do backend (rotas de cadastro, login e leitura/gravação de preferências) documentado antes de implementar.
- [x] Implementar a tela no popup, guardando só o token em `chrome.storage.local` e usando HTTPS. Atualizar `host_permissions` somente para o domínio do backend, se possível.
- [x] Sincronizar as preferências com o backend sem quebrar o uso offline/sem login.
- [ ] Testar com o Google de verdade (login, logout, token expirado). Já testados com o Google simulado: login, logout, sincronização, sem Client ID e backend fora do ar.

### 5. Atualizar documentação e Markdowns (por último)
Fica por último (depois da Tarefa 6) para refletir o código já refatorado. Itens já encontrados desatualizados:
- [ ] `config.json`: versão `1.0.0` (manifest está em `1.2.0`); `file-structure` cita `images/icon128.svg` e omite `background.js`, `viewer.*`, `pdf-blocks.js`, `lib/`; `permissions` lista `scripting`, mas o manifest usa `storage`, `activeTab`, `webRequest` e `<all_urls>`; não menciona `Alt+P` nem o leitor de PDF.
- [ ] `README.md`: em "Limitações conhecidas" diz que não lê PDFs, mas a própria seção "Leitura de PDFs" descreve o leitor; diz que `DEFAULT_STATE` está em três arquivos (são quatro); a estrutura de pastas não lista `docs/`, `exemplos/` e `INSTALACAO.html`; a tabela "DOC-01 a DOC-04" não bate com os PDFs de `docs/`.
- [ ] `RESUMO.md`: versão `1.0.0`; ícone SVG (hoje são PNG); afirma usar `MutationObserver` (o README diz que não usa); lista "Suporte a PDF" como futuro; lista só 5 arquivos principais.
- [ ] `INICIO_RAPIDO.md` e `CHECKLIST.md`: versão `1.0.0`, ícone SVG e nenhum item sobre PDF ou `Alt+P`.
- [ ] Ainda **não verificados**: `INSTALACAO.html`, `TESTE.html` e os dois PDFs em `docs/`. Conferir e corrigir.
- [ ] Atualizar também tudo que as tarefas 1 a 4 mudarem (estrutura, login, UI) e revisar se os cinco Markdowns não repetem o mesmo conteúdo; consolidar se fizer sentido.

### 6. Suporte a outros idiomas (inglês e espanhol)
Hoje o produto é só em português (pt-BR). Permitir usar a extensão em inglês e espanhol, tanto na interface quanto na voz.
- [ ] **Definir antes de começar (perguntar ao dono):** o idioma da interface acompanha o do navegador ou é escolhido no popup? A voz de narração muda junto com a interface ou acompanha o idioma de cada página (`lang`)?
- [ ] Escolher a estratégia de textos: `chrome.i18n` (`_locales/pt_BR`, `en`, `es` + `messages.json`) ou um dicionário próprio em `src/shared/`. Decidir e documentar no `CLAUDE.md`, mantendo o projeto sem build.
- [ ] Extrair todo texto visível e falado (popup, leitor de PDF, avisos, anúncios `aria-live`, nome e descrição no `manifest.json`) para os arquivos de tradução.
- [ ] Ligar o idioma da voz ao campo `language` do `extensionState` (hoje fixo em `pt-BR`), com opções `pt-BR`, `en-US` e `es-ES`, e escolher a voz instalada que corresponda.
- [ ] Seletor de idioma no popup, seguindo o visual novo (desenhar no Figma e aguardar aprovação antes de codar).
- [ ] Revisar o agrupamento de parágrafos em `pdf-blocks.js` para PDFs em inglês e espanhol (hifenização, pontuação como ¿ e ¡).
- [ ] Testar nos três idiomas: popup, leitor de PDF, narração em `TESTE.html` e `Alt+A`/`Alt+P`.
- [ ] Atualizar a documentação (Tarefa 5) com o suporte a idiomas.

## Concluído ✅

### ✅ 1. Arquitetura fácil de evoluir
Organizar o código para que novas features entrem sem mexer em vários arquivos e para que um novo dev entenda a aplicação inteira lendo pouco.
- [x] Extrair o que hoje está duplicado em `background.js`, `content.js`, `popup.js` e `viewer.js` (`DEFAULT_STATE`, `STORAGE_KEY`, `clamp`, leitura/gravação do estado) para um único módulo compartilhado.
- [x] Resolver a restrição de que `content.js` não aceita `import`: decidir e documentar como compartilhar esse código (ex.: script carregado antes no `manifest.json`).
- [x] Definir a estrutura de pastas (ex.: `src/` com `background`, `content`, `popup`, `viewer`, `shared`), mantendo o projeto carregável sem build.
- [x] Reduzir comentários aos essenciais (o porquê, não o quê). Manter as referências `RF-xx` / `RN-xx`.
- [x] Atualizar `manifest.json`, o `CLAUDE.md` e o mapa de arquivos depois de mover qualquer coisa.

### ✅ 2. Refatoração e legibilidade
- [x] Quebrar funções longas (`viewer.js` tem ~770 linhas e `content.js` ~370) em funções pequenas com nomes claros.
- [x] Remover código morto e duplicação; padronizar nomes e o estilo de tratamento de erros.
- [x] Garantir que o comportamento não mudou (checklist de validação do `CLAUDE.md`, incluindo os PDFs de `exemplos/`).

### ✅ 3. Nova UI do popup, moderna e com animações
- [x] Levantar a identidade atual (variáveis `--cor-*` em `popup.css`; tema escuro azul, `#00A8E8`) e propor a direção visual no Figma antes de codar.
- [x] Usar `imskyleen/animate-ui` como referência de animações e reproduzi-las em CSS/JS puro (sem React). Se algum efeito não tiver equivalente nativo, adaptar até o resultado visual ficar igual.
- [x] Animações respeitam `prefers-reduced-motion`; contraste e foco visível preservados (público com baixa visão).
- [x] Aplicar o mesmo visual ao leitor de PDF (`viewer.html/css`) para manter coerência.
