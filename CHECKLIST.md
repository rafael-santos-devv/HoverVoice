# Checklist de Verificação — HoverVoice v1.2.0

Roteiro manual para conferir a extensão antes de uma entrega. Marque cada item ao testar. Ao terminar, preencha o resumo no fim.

## 1. Instalação

- [ ] `manifest.json` é JSON válido e os ícones `icon16.png`, `icon48.png` e `icon128.png` existem em `images/`
- [ ] A extensão carrega em `chrome://extensions/` (modo de desenvolvedor, "Carregar sem compactação") sem erros
- [ ] O ícone aparece na barra de ferramentas
- [ ] Ao abrir o popup, o console da página do service worker não mostra erros

## 2. Ativação e narração (`TESTE.html`)

- [ ] O popup abre com o visual novo (cabeçalho, selo Ativo/Inativo, cartões)
- [ ] Ativar pelo seletor muda o selo para "Ativo" e o texto do cartão principal
- [ ] Passar o mouse num parágrafo narra o texto, com contorno no elemento
- [ ] Passar rápido por vários elementos não dispara fala
- [ ] `Tab` e `Shift + Tab` narram cada elemento focado
- [ ] Narra: título, parágrafo, link, botão, item de lista, célula de tabela, rótulo e campo de formulário, imagem com `alt`, SVG com título
- [ ] Elemento aninhado (um `span` dentro de um `p`) é narrado uma vez só
- [ ] Uma nova fala cancela a anterior
- [ ] `Alt + A` liga e desliga; ao ligar, fala "HoverVoice ativado"; ao desligar, a fala para

## 3. Voz e configurações

- [ ] **Testar voz**: texto vazio mostra aviso; com texto, **Ouvir** fala
- [ ] Velocidade, tom e volume mudam a fala seguinte; volume 0% fica mudo
- [ ] A seção de configurações abre e fecha com animação (e sem animação com `prefers-reduced-motion`)
- [ ] Fechar e reabrir o popup mantém os valores
- [ ] Mudar no popup vale numa aba já aberta, sem recarregar

## 4. Idiomas e vozes

- [ ] Idioma da interface PT, EN e ES troca todos os textos do popup na hora e fica salvo
- [ ] Sem escolha salva, o popup segue o idioma do navegador (português se for outro)
- [ ] Idioma da voz **Automático**: página com `lang="en"` é lida com voz inglesa; sem `lang`, com a voz do idioma da interface
- [ ] Idioma da voz fixo (PT, EN ou ES) ignora o `lang` da página
- [ ] A lista **Voz** mostra as vozes instaladas do idioma; escolher uma muda a fala; "Padrão do sistema" volta ao normal
- [ ] Idioma sem voz instalada mostra o aviso, sem quebrar
- [ ] O `lang` de páginas de terceiros não é alterado pela extensão

## 5. Leitor de PDF

- [ ] Com "Abrir PDFs no leitor" ligado, abrir um PDF no navegador vai para o leitor
- [ ] `Alt + P` abre o PDF da aba atual (ou um leitor vazio)
- [ ] `exemplos/relatorio-exemplo.pdf`: parágrafos narrados ao passar o mouse e por `Tab`
- [ ] `exemplos/duas-colunas-exemplo.pdf`: respeita as colunas
- [ ] Botões **Abrir arquivo**, **Baixar cópia**, tamanho (− / +) e narração funcionam
- [ ] Arrastar um PDF para a janela abre o arquivo
- [ ] PDF com senha pede a senha; PDF escaneado avisa que não há texto
- [ ] `Esc` interrompe a fala
- [ ] A interface do leitor também troca de idioma

## 6. Conta com Google (opcional)

Só com o backend no ar e o Client ID configurado (`docs/api-contrato.md`).

- [ ] Com `GOOGLE_CLIENT_ID` vazio (estado atual), o cartão de conta **não aparece** e todo o resto funciona
- [ ] Sem conta, tudo funciona como antes, e **Agora não** volta ao popup
- [ ] **Entrar** abre o login do Google; depois mostra o e-mail e "Preferências sincronizadas"
- [ ] Mudar a velocidade e soltar o controle grava na conta; em outro navegador, entrar traz o mesmo valor
- [ ] **Sair** apaga a sessão e mantém as preferências locais
- [ ] Servidor fora do ar: aparece o aviso de sem conexão e a extensão segue com as preferências locais
- [ ] Sessão expirada: aparece o aviso e o botão volta a "Entrar"

## 7. Acessibilidade da interface

- [ ] Todo o popup e o leitor funcionam só com o teclado, com foco visível em cada controle
- [ ] Mensagens de estado são anunciadas (`role="status"`)
- [ ] Textos e controles têm contraste mínimo de 4,5:1 (medir com uma ferramenta de contraste)
- [ ] Nenhum `alert()` é usado

## 8. Compatibilidade

- [ ] Testado no Google Chrome
- [ ] Testado no Microsoft Edge

## Resumo

Problemas encontrados:

```
1. [descrição] — solução:
```

Itens confirmados: ___ de ___  ·  Status: [ ] Pronto  [ ] Com ressalvas  [ ] Com problemas

**Data:** ___/___/______  ·  **Responsável:** _____________________  ·  **Navegador e versão:** _____________________
