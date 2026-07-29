# HoverVoice - Extensão de Acessibilidade 🎙️

Uma extensão de navegador que fornece narração em áudio quando você passa o mouse sobre elementos da página, tornando a internet mais acessível para pessoas com deficiência visual.

## Recursos ✨

- **Narração ao Passar o Mouse**: Ouça o conteúdo de qualquer elemento ao passar o mouse
- **Atalhos de Teclado**: 
  - `Alt + A` para ativar/desativar
  - `Tab` para navegar por elementos
- **Configurações de Voz Personalizáveis**:
  - Velocidade de fala (0.5x a 2x)
  - Tom da voz (0.5x a 2x)
  - Volume (0% a 100%)
- **Suporte a Múltiplos Elementos**:
  - Texto de parágrafos, botões e links
  - Descrições alternativas de imagens
  - Rótulos de campos de formulário
  - Títulos e subtítulos da página

## Instalação 📦

### Para Chrome/Edge (Modo Desenvolvimento)

1. Clone ou extraia os arquivos da extensão
2. Abra `chrome://extensions/` (Chrome) ou `edge://extensions/` (Edge)
3. Ative o **"Modo de desenvolvedor"** no canto superior direito
4. Clique em **"Carregar extensão sem empacotamento"**
5. Selecione a pasta da extensão

## Como Usar 🎯

### Ativar a Extensão

1. Clique no ícone da extensão na barra de ferramentas
2. Alterne o switch **"HoverVoice"** para ativar
3. A extensão começará a narrar quando você passar o mouse sobre elementos

### Configurar a Voz

1. Abra o popup da extensão
2. Clique em **"Configurações de Voz"**
3. Ajuste:
   - **Velocidade**: Quanto mais rápido você quer a narração
   - **Tom**: Altere o pitch da voz
   - **Volume**: Controle o volume de saída

### Testar a Narração

1. Digite um texto no campo **"TESTAR VOZ"**
2. Clique no botão **"Ouvir"**
3. A extensão reproduzirá o áudio do seu texto

## Estrutura do Projeto 📁

```
HoverVoice/
├── manifest.json      # Configuração da extensão
├── popup.html         # Interface do popup
├── popup.css          # Estilos do popup
├── popup.js           # Lógica do popup
├── content.js         # Script de conteúdo (executa nas páginas)
├── images/            # Ícones da extensão
└── README.md          # Este arquivo
```

## Arquivos Principais 📄

### manifest.json
Define as permissões e metadados da extensão.

### popup.html / popup.css / popup.js
Interface do usuário para controlar a extensão e testar a voz.

### content.js
Script que executa nas páginas web:
- Detecta elementos interativos
- Adiciona event listeners para hover e focus
- Gerencia a síntese de voz
- Suporta carregamento dinâmico de elementos

## Tecnologias Utilizadas 🛠️

- **Web Speech API**: Para síntese de voz
- **Chrome Storage API**: Para persistência de configurações
- **Mutation Observer**: Para detectar elementos adicionados dinamicamente
- **CSS3**: Para animações e estilos

## Navegadores Suportados 🌐

- ✅ Google Chrome (recomendado)
- ✅ Microsoft Edge
- ✅ Chromium-based browsers

## Idiomas 🌍

- Português (Brasil) - Padrão
- Extensível para outros idiomas

## Limitações ⚠️

- Requer que JavaScript esteja habilitado
- A síntese de voz depende da API nativa do navegador
- Alguns navegadores podem ter limitações de idiomas disponíveis

## Troubleshooting 🔧

### A extensão não está funcionando
1. Verifique se está habilitada em `chrome://extensions/`
2. Recarregue a página web (Ctrl + R)
3. Verifique se JavaScript está habilitado

### A voz não é ouvida
1. Verifique o volume do navegador
2. Verifique as configurações de áudio do sistema
3. Tente testar com o campo de teste de voz

### Elementos não estão sendo narrados
1. Ative a extensão no popup
2. Certifique-se de que está passando o mouse sobre elementos válidos
3. Verifique se o elemento tem conteúdo de texto

## Desenvolvimento 👨‍💻

### Adicionar novo idioma

Em `popup.js` e `content.js`, procure por:
```javascript
language: 'pt-BR'
```

Altere ou estenda com outros códigos de idioma (ex: 'en-US', 'es-ES').

### Modificar seletores CSS

Em `content.js`, procure por `selectorsToListen` para adicionar ou remover elementos a serem narrados.

## Licença 📜

Projeto Senai - Educacional

## Contribuições 🤝

Contribuições são bem-vindas! Sinta-se à vontade para:
- Reportar bugs
- Sugerir novos recursos
- Enviar melhorias de código

## Contato 📧

Para dúvidas ou sugestões sobre o HoverVoice, abra uma issue no repositório.

---

**Versão**: 1.0.0  
**Última atualização**: 2026  
**Idioma**: Português (Brasil)
