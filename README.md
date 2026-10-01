# HoverVoice — Extensão de Acessibilidade 🎙️

Extensão de navegador que narra o conteúdo de páginas web conforme o usuário as percorre com o cursor ou com o teclado, ampliando a autonomia de navegação de pessoas com deficiência visual ou baixa visão.

**Versão:** 1.2.0 · **Idioma:** Português (Brasil) · **Licença:** Educacional

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
- **Configurações de voz** — velocidade e tom (0.5x a 2x) e volume (0% a 100%)
- **Preferências persistentes** — mantidas entre sessões e sincronizadas entre abas
- **Realce visual** — o elemento em narração recebe contorno, sem alterar o layout da página
- **Leitor de PDF** — PDFs abertos no navegador são carregados automaticamente em um leitor próprio, onde cada parágrafo é narrado ao passar o mouse ou ao receber o foco com `Tab`
- **Operação local** — nenhum dado sai do dispositivo

### O que é narrado

Parágrafos, títulos (`h1`–`h6`), botões, links, itens de lista, células de tabela, rótulos de formulário, campos de entrada, texto alternativo de imagens, títulos de SVG e elementos com atributos ARIA.

---

## Instalação

> ⚠️ **Antes de instalar:** o Chrome **não aceita ícones em SVG**. Converta o ícone para PNG e coloque em `images/` os arquivos `icon16.png`, `icon48.png` e `icon128.png`. Sem eles a extensão não carrega.

1. Baixe ou clone este repositório
2. Abra `chrome://extensions/` (Chrome) ou `edge://extensions/` (Edge)
3. Ative o **Modo de desenvolvedor**, no canto superior direito
4. Clique em **Carregar sem compactação**
5. Selecione a pasta do projeto

---

## Como usar

1. Clique no ícone da extensão na barra de ferramentas
2. Ative o seletor **HoverVoice** — ou pressione `Alt + A`
3. Passe o mouse sobre qualquer elemento da página

Ao ativar pela primeira vez, a extensão anuncia em voz "HoverVoice ativado" — retorno pensado para quem usa o atalho sem enxergar a interface.

Para testar a voz sem sair do popup, digite um texto no campo **TESTAR VOZ** e clique em **Ouvir**.

---

## Leitura de PDFs

O visualizador de PDF nativo do Chrome é isolado: extensões não alcançam o texto exibido nele. Por isso o HoverVoice abre o PDF em um **leitor próprio** (`viewer.html`), desenhado com o [PDF.js](https://mozilla.github.io/pdf.js/) (Mozilla, licença Apache 2.0, incluído em `lib/`).

**Como abrir um PDF**

- **Automático** — com a extensão ativa e a chave "Abrir PDFs no leitor" ligada no popup, qualquer PDF aberto no navegador é redirecionado ao leitor. PDFs de download (`Content-Disposition: attachment`) não são afetados.
- **Atalho `Alt + P`** — abre no leitor o PDF da aba atual (ou um leitor vazio).
- **Arquivo do computador** — botão **Abrir arquivo** ou arrastar o PDF para a janela do leitor.

**No leitor**

- Passe o mouse sobre um parágrafo, ou use `Tab` / `Shift + Tab`, para ouvi-lo. Os parágrafos são agrupados a partir das linhas do PDF e respeitam colunas.
- `Esc` interrompe a fala. Os botões permitem alterar o tamanho, baixar uma cópia do PDF e ligar ou desligar a narração.
- PDFs com senha pedem a senha. Se o PDF não puder ser carregado (por exemplo, exige login), há um botão para abri-lo no visualizador do navegador.

**Limitações conhecidas**

- **PDFs escaneados** (só imagem) não têm texto a narrar; o leitor avisa. Seria necessário OCR.
- **Arquivos locais por endereço** (`file://`) só são redirecionados se for ativado "Permitir acesso a URLs de arquivo" nos detalhes da extensão em `chrome://extensions`. Sem isso, use **Abrir arquivo**.
- Em parágrafos muito longos (mais de ~480 caracteres), a narração é dividida em trechos, cortando no fim de uma linha.
- Texto girado (como marcas d'água) não é narrado.

---

## Estrutura do projeto

```
HoverVoice/
├── manifest.json      # Configuração, permissões e atalhos (Manifest V3)
├── background.js      # Service worker — atalhos e redirecionamento de PDFs
├── content.js         # Executa nas páginas web — captura e narração
├── viewer.html        # Leitor de PDF (página da extensão)
├── viewer.js          # Leitor de PDF — carregamento, desenho das páginas e blocos
├── viewer.css         # Estilos do leitor
├── pdf-blocks.js      # Agrupa o texto do PDF em parágrafos narráveis
├── lib/               # PDF.js (pdf.min.mjs, worker, fontes e mapas de caracteres)
├── popup.html         # Interface do usuário
├── popup.css          # Estilos da interface
├── popup.js           # Lógica da interface
├── images/            # Ícones da extensão (PNG)
├── TESTE.html         # Página de teste com todos os tipos de elemento
└── README.md          # Este arquivo
```

---

## Arquitetura

```
┌─────────────┐  grava   ┌──────────────────┐   lê    ┌──────────────┐
│ popup.js    │─────────▶│  chrome.storage  │◀────────│  content.js  │
└─────────────┘          │      .local      │         └──────┬───────┘
                         └──────────────────┘                │
┌─────────────┐  grava            ▲                          ▼
│background.js│───────────────────┘                  ┌───────────────┐
│  (Alt + A)  │                                      │ Web Speech API│
└─────────────┘                                      └───────────────┘
```

O **armazenamento local é a única fonte de verdade**. Popup e content script observam `chrome.storage.onChanged`, de modo que qualquer alteração se propaga sozinha para todas as abas abertas — sem envio manual de mensagens.

### Delegação de eventos

O `content.js` registra **dois listeners no `document`** (`pointerover` e `focusin`), não um listener por elemento. O alvo é resolvido com `Element.closest()`. Isso traz três consequências:

- **Desempenho** — nada é percorrido ou registrado a cada mutação do DOM
- **Elementos aninhados** — `closest()` retorna o elemento mais específico, então um `<span>` dentro de um `<p>` narra uma vez só
- **Conteúdo dinâmico** — elementos inseridos após o carregamento funcionam automaticamente, sem `MutationObserver`

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

## Tecnologias

| Tecnologia | Uso |
|---|---|
| JavaScript (Vanilla) | Toda a lógica — sem dependências externas |
| Web Speech API | Síntese de voz |
| Chrome Storage API | Persistência e sincronização de preferências |
| Chrome Commands API | Atalho de teclado |
| Manifest V3 | Padrão de extensão |

---

## Navegadores suportados

| Navegador | Versão mínima | Situação |
|---|---|---|
| Google Chrome | 90 | Suportado |
| Microsoft Edge | 90 | Suportado |
| Outros baseados em Chromium | 90 | Deve funcionar |
| Firefox | — | Não suportado nesta versão |
| Safari | — | Não suportado nesta versão |

---

## Limitações conhecidas

- Requer JavaScript habilitado
- A qualidade e a disponibilidade das vozes dependem do sistema operacional
- Não narra conteúdo dentro de `<iframe>` (`all_frames` está desativado por desempenho)
- Não lê documentos PDF nem conteúdo desenhado em `<canvas>`
- Não substitui um leitor de tela completo — posiciona-se como complemento de baixo atrito

---

## Solução de problemas

**A extensão não carrega**
Verifique se os ícones PNG existem em `images/`. Ícones SVG causam erro no carregamento.

**O atalho `Alt + A` não funciona**
Confira em `chrome://extensions/shortcuts` se o atalho foi atribuído. Outra extensão pode estar usando a mesma combinação.

**Nenhum áudio é reproduzido**
Verifique o volume do sistema e do navegador. Teste com o botão **Ouvir** no popup. Confirme que há voz em português instalada no sistema.

**Elementos não são narrados**
Confirme que a extensão está ativa e que o elemento possui conteúdo textual, rótulo ou descrição alternativa.

---

## Desenvolvimento

### Alterar o idioma

O idioma padrão está definido como `pt-BR` na constante `DEFAULT_STATE`, presente em `background.js`, `content.js` e `popup.js`. Altere nos três arquivos ou exponha a opção na interface.

### Alterar os elementos narrados

Em `content.js`, edite a constante `NARRATABLE_SELECTOR`.

### Ajustar a latência

Em `content.js`, a constante `HOVER_DELAY_MS` (padrão: 120 ms) define o tempo de estabilização antes de iniciar a locução. Valores menores tornam a resposta mais imediata, porém disparam fala para elementos apenas atravessados pelo cursor.

### Convenções de código

- Indentação de 4 espaços
- `const` por padrão; `let` apenas quando houver reatribuição
- Nomes de funções e variáveis em `camelCase`, em inglês
- Comentários em português, explicando a intenção
- Classes CSS injetadas usam o prefixo `hovervoice-`

---

## Documentação do projeto

| Documento | Conteúdo |
|---|---|
| DOC-01 | Controle de Projeto — sprints, riscos, cronograma |
| DOC-02 | Qualidade — casos de teste e critérios de aceitação |
| DOC-03 | Negócios — viabilidade e impacto social |
| DOC-04 | Requisitos — Product Backlog e especificação |

---

## Licença

Projeto SENAI — uso educacional.

---

**Tornando a internet mais acessível para todos.** 🎙️
