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

_(nenhuma)_

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

### ✅ 6. Suporte a outros idiomas (inglês e espanhol)
Hoje o produto é só em português (pt-BR). Permitir usar a extensão em inglês e espanhol, tanto na interface quanto na voz.
- [x] **Decisões do dono:** seletor de idioma no popup (padrão = idioma do navegador: pt, en ou es, senão pt-BR; escolha salva); a voz acompanha o `lang` de cada página/PDF e, se faltar, o idioma da interface; textos em dicionário próprio (`src/shared/i18n.js`), sem `chrome.i18n`.
- [x] Escolher a estratégia de textos: `chrome.i18n` (`_locales/pt_BR`, `en`, `es` + `messages.json`) ou um dicionário próprio em `src/shared/`. Decidir e documentar no `CLAUDE.md`, mantendo o projeto sem build.
- [x] Extrair todo texto visível e falado (popup, leitor de PDF, avisos, anúncios `aria-live`, nome e descrição no `manifest.json`) para os arquivos de tradução.
- [x] Seletor "Idioma da voz": **Automático** (padrão: `lang` da página/PDF e, se faltar, o da interface), PT, EN ou ES fixos (imersão). Ligar ao campo `language` do `extensionState` (hoje fixo em `pt-BR`).
- [x] Escolha de voz: lista de `speechSynthesis.getVoices()` filtrada pelo idioma, com "padrão do sistema"; guardar a voz escolhida por idioma. Lidar com a lista assíncrona (`voiceschanged`) e com vozes que somem.
- [x] Ideia futura (fora desta tarefa): traduzir o conteúdo das páginas; exige serviço externo.
- [x] Desenhar o seletor de idioma no Figma (seção "Idiomas · proposta", nó `57:12`, popup em PT, EN e ES). Inclui o popup com "Idioma da voz" e escolha de voz (nó `59:18`). **Aguardando aprovação do design antes de codar.**
- [x] Implementar o seletor de idioma no popup.
- [x] Revisar o agrupamento de parágrafos em `pdf-blocks.js` para PDFs em inglês e espanhol: o fim de frase (`.!?…`) e a hifenização (letras acentuadas e ñ) já cobrem os dois idiomas; sem mudança. Não testado com PDFs reais em inglês/espanhol (só há exemplos em português).
- [x] Testar nos três idiomas (popup, leitor de PDF, `TESTE.html`), no Chrome por script. Não testado: voz real em espanhol (sem voz instalada na máquina de teste) e os atalhos `Alt+A`/`Alt+P`.
- [x] Atualizar a documentação (Tarefa 5) com o suporte a idiomas.

### ✅ 5. Atualizar documentação e Markdowns 
Reflete o código já refatorado, com login e idiomas.
- [x] `config.json`: versão 1.2.0, estrutura em `src/`, permissões reais, `Alt+P`, leitor de PDF, idiomas, conta e vozes.
- [x] `README.md`: reescrito (instalação, uso, idiomas e vozes, conta com Google, leitor de PDF, estrutura, arquitetura, permissões, limitações e solução de problemas atualizados).
- [x] `RESUMO.md` e `INICIO_RAPIDO.md`: removidos. Repetiam o README com dados vencidos (v1.0.0, ícone SVG, `MutationObserver`, PDF como "futuro"); o início rápido agora está no README. Continuam no histórico do git.
- [x] `CHECKLIST.md`: refeito como roteiro de verificação da v1.2.0 (inclui PDF, idiomas, vozes e conta).
- [x] `INSTALACAO.html` e `TESTE.html`: versão 1.2.0, `Alt+P`, idiomas, PDF e conta; `TESTE.html` ganhou parágrafos `lang="en"`, `lang="es"` e `lang="pt-BR"` para testar a voz automática; botões mortos de "Reportar problema" viraram links para as issues do GitHub.
- [x] Documentação do Software e Documento de Qualidade reescritos para a v1.2.0 em `docs/atualizados/` (`.docx` editável e `.pdf` de cada um). Os PDFs originais de `docs/` ficam como estavam. Pontos para a equipe conferir: IDs RF/RN/RNF novos (RF-11 a RF-17, RN-05 a RN-07, RNF-06 e RNF-07) continuam provisórios até o DOC-04; o ciclo 1 de testes foi por script (sem ouvir o áudio) e o contraste (CT-24) ainda precisa ser medido.

### ✅ 4. Tela de login e preferências salvas
Usuários que criarem login poderão salvar suas preferências de voz (velocidade, tom, volume e demais ajustes) e recuperá-las em outro navegador.
- [x] **Decisões do dono:** login e registro são **opcionais** e **minimalistas**; autenticação **só com Google** (entrar e criar conta são o mesmo fluxo); as preferências sincronizadas são velocidade, tom e volume (não existe "intensidade"). Sem e-mail/senha, logo sem "recuperar senha".
- [x] Backend: Node.js + SQLite, sem dependências, em `../HoverVoice-backend` (repositório git local, 5 testes passando). **Pendente do dono:** criar o cliente OAuth no Google Cloud (passos em `docs/api-contrato.md`), preencher `GOOGLE_CLIENT_ID`/`API_BASE_URL` em `src/shared/auth.js` e escolher a hospedagem com HTTPS.
- [x] Desenhar a tela de login no Figma (seção "Login com Google · proposta", nó `51:12`): convite, entrada, carregando, erro e logado. **Aguardando aprovação do design.**
- [x] Contrato da API do backend (rotas de cadastro, login e leitura/gravação de preferências) documentado antes de implementar.
- [x] Implementar a tela no popup, guardando só o token em `chrome.storage.local` e usando HTTPS. Atualizar `host_permissions` somente para o domínio do backend, se possível.
- [x] Sincronizar as preferências com o backend sem quebrar o uso offline/sem login.
- [x] Login **entregue desativado**: sem `GOOGLE_CLIENT_ID` em `src/shared/auth.js`, o cartão de conta fica oculto e a extensão usa só preferências locais (testado). Já testados com o Google simulado: login, logout, sincronização, backend fora do ar.
- [ ] **Ativação futura (fora do escopo desta entrega):** criar o cliente OAuth no Google Cloud (a conta exige forma de pagamento; pode ser feita por quem da equipe já tenha conta no Google Cloud), preencher o Client ID e testar com o Google real. Passos em `docs/api-contrato.md`.
