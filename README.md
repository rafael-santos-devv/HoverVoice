# HoverVoice — Extensão de Acessibilidade 🎙️

Extensão de navegador que narra o conteúdo de páginas web e de PDFs conforme a pessoa os percorre com o cursor ou com o teclado, ampliando a autonomia de navegação de quem tem deficiência visual ou baixa visão.

**Versão:** 1.2.0 · **Idiomas:** português, inglês e espanhol · **Licença:** Educacional

---

## Sobre o projeto

Projeto integrador desenvolvido no **Programa Full Stack**, iniciativa da Petrobras, no **SENAI Dendezeiros** — Salvador/BA.

**Docente orientador:** Matheus de Azevedo Porciúncula Santos

### Equipe

| Integrante | Papel |
|---|---|
| Carlos Henrique Madureira Santos | Scrum Master e Gerente de Projeto |
| Anna Luísa Paixão Miranda | Product Owner — frente de negócios |
| João Pedro Silva Nonato | Desenvolvedor — idealizador e arquitetura |
| Rafael Francisco Silva Santos | Desenvolvedor — interface |
| Pedro Henrique F. de Carvalho | Desenvolvedor — design e negócios |

A gestão do projeto segue o framework **Scrum**, em três sprints de duas semanas.

---

## Recursos

- **Narração ao passar o mouse** — o conteúdo do elemento apontado é lido em voz alta
- **Narração por teclado** — elementos que recebem foco via `Tab` também são narrados
- **Atalhos** — `Alt + A` ativa e desativa; `Alt + P` abre o PDF atual no leitor; `Tab` e `Shift + Tab` navegam
- **Configurações de voz** — velocidade e tom (0,5x a 2x), volume (0% a 100%) e escolha da voz entre as instaladas no sistema
- **Três idiomas** — interface em português, inglês e espanhol; a voz segue o idioma da página (modo Automático) ou um idioma fixo escolhido
- **Leitor de PDF** — PDFs abertos no navegador vão para um leitor próprio, onde cada parágrafo é narrado
- **Conta opcional com Google** — salva e sincroniza velocidade, tom e volume entre navegadores; sem conta, tudo continua funcionando localmente
- **Preferências persistentes** — mantidas entre sessões e sincronizadas entre abas
- **Realce visual** — o elemento em narração recebe contorno, sem alterar o layout da página
- **Privacidade** — sem conta, nenhum dado sai do dispositivo; com conta, só o e-mail e as três preferências de voz são enviados ao servidor

### O que é narrado

Parágrafos, títulos (`h1`–`h6`), botões, links, itens de lista, células de tabela, rótulos de formulário, campos de entrada, texto alternativo de imagens, títulos de SVG e elementos com atributos ARIA.

---

## Instalação e início rápido

1. Baixe ou clone este repositório
2. Abra `chrome://extensions/` (Chrome) ou `edge://extensions/` (Edge)
3. Ative o **Modo de desenvolvedor**
4. Clique em **Carregar sem compactação** e selecione a pasta do projeto (a que contém o `manifest.json`)
5. Fixe o ícone do HoverVoice na barra de ferramentas

Depois de editar qualquer arquivo, recarregue a extensão em `chrome://extensions/` e a página de teste.

## Como usar

1. Clique no ícone da extensão e ative o seletor **HoverVoice** — ou pressione `Alt + A`
2. Passe o mouse sobre qualquer elemento, ou navegue com `Tab`
3. Ajuste a voz em **Configurações de voz**; teste no campo **Testar voz** com o botão **Ouvir**

Ao ativar, a extensão anuncia em voz "HoverVoice ativado" — retorno pensado para quem usa o atalho sem enxergar a interface.

Para treinar, abra o `TESTE.html` (página com todos os tipos de elemento) e, para PDFs, os arquivos de `exemplos/`. O `CHECKLIST.md` traz o roteiro completo de verificação.

---

## Idiomas e vozes

- **Idioma da interface** (PT · EN · ES, na base do popup): o padrão é o idioma do navegador; se for outro, português. A escolha fica salva.
- **Idioma da voz**, em *Configurações de voz*:
  - **Automático** (padrão): usa o idioma declarado na página (`lang`) ou no PDF; se não houver, o da interface.
  - **PT, EN ou ES**: voz fixa, útil para treinar um idioma. A extensão **não traduz** o conteúdo: texto em português lido com voz inglesa sai com forte sotaque.
- **Voz**: lista as vozes instaladas no navegador e no sistema para o idioma. A escolha é guardada por idioma e, se a voz sumir, volta a padrão do sistema. Para ter mais vozes, instale pacotes de idioma e voz no sistema operacional.

---

## Conta com Google (opcional)

> **Estado atual: modo demonstração.** Enquanto `GOOGLE_CLIENT_ID` estiver vazio em `src/shared/auth.js`, o cartão de conta aparece com a etiqueta "Demonstração" e o login é **simulado**: sem Google e sem rede, com uma conta fictícia (`demo@hovervoice.dev`) cujas preferências ficam só neste navegador. Serve para apresentar a ideia. O código real, o backend e os testes estão prontos; falta criar o cliente OAuth no Google Cloud (que exige uma forma de pagamento cadastrada) e preencher o Client ID, e então o login passa a ser o real.

Com o login ativado, **Entrar**, na parte de cima do popup, abre o login do Google. Na primeira vez a conta é criada automaticamente.

- Sincroniza velocidade, tom e volume. Idioma, voz escolhida e abertura de PDFs ficam só neste navegador.
- Ao entrar, as preferências da conta substituem as locais; em conta nova, as locais são enviadas.
- Sem internet ou com o servidor fora do ar, a extensão segue com as preferências locais e avisa.
- A extensão guarda só o token de sessão e o e-mail em `chrome.storage.local`; nunca senha.
- Exige o backend ([HoverVoice-backend](https://github.com/MadureiraHenrique/HoverVoice-backend), privado; Node.js + SQLite) e um Client ID do Google. Contrato e configuração em [`docs/api-contrato.md`](docs/api-contrato.md).

---

## Leitura de PDFs

O visualizador de PDF nativo do Chrome é isolado: extensões não alcançam o texto exibido nele. Por isso o HoverVoice abre o PDF em um **leitor próprio** (`src/viewer/viewer.html`), desenhado com o [PDF.js](https://mozilla.github.io/pdf.js/) (Mozilla, licença Apache 2.0, incluído em `lib/`).

**Como abrir um PDF**

- **Automático** — com a extensão ativa e a chave "Abrir PDFs no leitor" ligada, qualquer PDF aberto no navegador vai ao leitor. PDFs de download (`Content-Disposition: attachment`) não são afetados.
- **Atalho `Alt + P`** — abre no leitor o PDF da aba atual (ou um leitor vazio).
- **Arquivo do computador** — botão **Abrir arquivo** ou arrastar o PDF para a janela do leitor.

**No leitor**

- Passe o mouse sobre um parágrafo, ou use `Tab` / `Shift + Tab`. Os parágrafos são agrupados a partir das linhas do PDF e respeitam colunas.
- `Esc` interrompe a fala. Os botões alteram o tamanho, baixam uma cópia e ligam ou desligam a narração.
- PDFs com senha pedem a senha. Se não carregar (por exemplo, exige login), há um botão para abrir no visualizador do navegador.

**Limitações**

- **PDFs escaneados** (só imagem) não têm texto a narrar; o leitor avisa. Seria necessário OCR.
- **Arquivos locais por endereço** (`file://`) só são redirecionados com "Permitir acesso a URLs de arquivo" ativado nos detalhes da extensão. Sem isso, use **Abrir arquivo**.
- Parágrafos com mais de ~480 caracteres são divididos em trechos, cortando no fim de uma linha.
- Texto girado (como marcas d'água) não é narrado.

---

## Estrutura do projeto

```
HoverVoice/
├── manifest.json            # Configuração, permissões e atalhos (Manifest V3)
├── src/
│   ├── shared/
│   │   ├── state.js         # Estado padrão e acesso ao storage (global HoverVoice)
│   │   ├── i18n.js          # Textos em pt, en e es (global HoverVoiceI18n)
│   │   ├── voice.js         # Idioma e escolha de voz (global HoverVoiceVoice)
│   │   └── auth.js          # Login com Google e sincronização (global HoverVoiceAuth)
│   ├── background/          # Service worker: atalhos e redirecionamento de PDFs
│   ├── content/             # Roda nas páginas: captura, narração e realce
│   ├── popup/               # Interface da extensão
│   └── viewer/              # Leitor de PDF e agrupamento do texto em parágrafos
├── lib/                     # PDF.js de terceiros (não editar)
├── images/                  # Ícones da extensão (PNG)
├── exemplos/                # PDFs para teste manual
├── docs/                    # Documentos do projeto e contrato da API
├── TESTE.html               # Página de teste com todos os tipos de elemento
├── INSTALACAO.html          # Guia de instalação e uso
├── CHECKLIST.md             # Roteiro de verificação manual
├── config.json              # Metadados do projeto
├── CLAUDE.md                # Regras de trabalho do projeto
└── TASKS.md                 # Quadro de tarefas
```

O projeto não usa build, bundler nem dependências. Os arquivos de `src/shared/` são scripts comuns que publicam um objeto global; cada contexto os carrega antes do seu próprio código (`content_scripts` do manifest, `<script>` no popup e no leitor, `importScripts()` no service worker).

---

## Arquitetura

```
┌─────────────┐  grava   ┌──────────────────┐   lê    ┌──────────────┐
│ popup.js    │─────────▶│  chrome.storage  │◀────────│  content.js  │
└──────┬──────┘          │      .local      │         └──────┬───────┘
       │ login           └──────────────────┘                │
       ▼                          ▲                          ▼
┌─────────────┐  (token e   ┌─────┴──────┐          ┌───────────────┐
│  Backend    │  preferências│background.js│          │ Web Speech API│
│ Node+SQLite │             │  (Alt + A)  │          └───────────────┘
└─────────────┘             └────────────┘
```

O **armazenamento local (`extensionState`) é a única fonte de verdade**. Popup, leitor e content script observam `chrome.storage.onChanged`, então qualquer alteração se propaga sozinha para todas as abas, sem troca manual de mensagens. O backend só guarda uma cópia das três preferências de voz para quem tem conta.

### Delegação de eventos

O `content.js` registra **dois listeners no `document`** (`pointerover` e `focusin`), não um por elemento. O alvo é resolvido com `Element.closest()`:

- **Desempenho** — nada é percorrido ou registrado a cada mutação do DOM
- **Elementos aninhados** — `closest()` retorna o mais específico, então um `<span>` dentro de um `<p>` narra uma vez só
- **Conteúdo dinâmico** — elementos inseridos depois funcionam sem `MutationObserver`

### Ordem de extração do texto

1. `aria-label`
2. `aria-labelledby`
3. Imagens: `alt` → `title` → descrição genérica
4. SVG: elemento `<title>`
5. Campos de formulário: `<label for>` → `<label>` envolvente → `placeholder` → `title` → `value`
6. `title`
7. `textContent`

O texto é normalizado (espaços colapsados) e limitado a 500 caracteres.

---

## Permissões

| Permissão | Por quê |
|---|---|
| `storage` | Guardar as preferências e a sessão |
| `activeTab` | Atalho `Alt + P` sobre a aba atual |
| `webRequest` | Detectar respostas PDF para abrir no leitor |
| `identity` | Login opcional com Google (`launchWebAuthFlow`) |
| `<all_urls>` | Narrar qualquer página e ler PDFs de qualquer endereço |

---

## Tecnologias

| Tecnologia | Uso |
|---|---|
| JavaScript (Vanilla) | Toda a extensão — sem dependências |
| Web Speech API | Síntese de voz |
| Chrome Storage, Commands, Identity | Persistência, atalhos e login |
| PDF.js | Desenho e texto dos PDFs |
| Manifest V3 | Padrão de extensão |
| Node.js + SQLite (backend, repositório separado) | Conta e preferências sincronizadas |

---

## Navegadores suportados

| Navegador | Versão mínima | Situação |
|---|---|---|
| Google Chrome | 90 | Suportado |
| Microsoft Edge | 90 | Suportado |
| Outros baseados em Chromium | 90 | Deve funcionar |
| Firefox e Safari | — | Não suportados |

---

## Limitações conhecidas

- A qualidade e a disponibilidade das vozes dependem do sistema operacional
- Não narra conteúdo dentro de `<iframe>` (`all_frames` está desativado por desempenho) nem em páginas internas do navegador
- Não lê conteúdo desenhado em `<canvas>`
- Não traduz o conteúdo das páginas; só a interface e a escolha da voz
- Não substitui um leitor de tela completo — é um complemento de baixo atrito

---

## Solução de problemas

**A extensão não carrega** — Verifique se os ícones PNG (`icon16.png`, `icon48.png`, `icon128.png`) existem em `images/`; o Chrome não aceita SVG.

**O atalho `Alt + A` não funciona** — Confira em `chrome://extensions/shortcuts`. Outra extensão pode usar a mesma combinação.

**Nenhum áudio** — Verifique o volume do sistema, do navegador e do popup. Teste com **Ouvir**. Confirme que há voz instalada para o idioma escolhido (em *Configurações de voz*, a lista mostra o que existe).

**Uma página é lida com a voz errada** — No modo Automático, a página usa o próprio `lang`; sem ele, vale o idioma da interface. Fixe PT, EN ou ES em *Idioma da voz* se preferir.

**Elementos não são narrados** — Confirme que a extensão está ativa e que o elemento tem texto, rótulo ou descrição.

**O login mostra "Demonstração"** — É o esperado enquanto o Client ID não estiver configurado em `src/shared/auth.js` (veja `docs/api-contrato.md`): o login é simulado e nada sai do navegador. Com o Client ID, o login é o real e precisa do backend no ar. Sem conta, a extensão funciona normalmente, só sem sincronização.

---

## Desenvolvimento

- **Elementos narrados:** edite `NARRATABLE_SELECTOR` em `src/content/content.js`.
- **Latência:** `HOVER_DELAY_MS` (120 ms) em `src/content/content.js` define a espera antes de falar; valores menores respondem mais rápido, mas falam elementos só atravessados pelo cursor.
- **Novos textos:** adicione a chave nos três idiomas em `src/shared/i18n.js` e use `data-i18n` (HTML) ou `HoverVoiceI18n.t()` (JS).
- **Convenções:** indentação de 4 espaços; `const` por padrão; nomes em `camelCase`, em inglês; comentários em português só para explicar o porquê; classes CSS injetadas em páginas de terceiros usam o prefixo `hovervoice-`.
- **Validação:** `node --check` nos `.js` alterados, recarregar a extensão e seguir o `CHECKLIST.md` e a seção "Validação" do `CLAUDE.md`.

---

## Documentação do projeto

| Documento | Conteúdo |
|---|---|
| `docs/HoverVoice-Documentacao-do-Software` (`.docx` e `.pdf`) | Visão geral, requisitos, arquitetura, instalação, login e idiomas (v1.2.0) |
| `docs/HoverVoice-Documento-de-Qualidade` (`.docx` e `.pdf`) | Estratégia de testes, casos de teste, rastreabilidade e registro de execução (v1.2.0) |
| `docs/api-contrato.md` | Contrato da API de login e preferências |

O `.docx` é a versão editável; o `.pdf` é gerado a partir do mesmo conteúdo. Os documentos de gestão (controle de projeto, negócios e requisitos/Product Backlog) são mantidos pela equipe fora deste repositório.

---

## Licença

Projeto SENAI — uso educacional.

---

**Tornando a internet mais acessível para todos.** 🎙️
