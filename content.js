// Estado da extensão
let hoverVoiceState = {
    enabled: false,
    voiceRate: 1,
    voicePitch: 1,
    voiceVolume: 1,
    language: 'pt-BR'
};

// Elementos atualmente em hover
let hoveredElements = new Set();
let isProcessing = false;

// Carregador de estado ao injetar o script
chrome.storage.local.get(['extensionState'], (result) => {
    if (result.extensionState) {
        hoverVoiceState = result.extensionState;
        initializeListeners();
    }
});

// Escutar mudanças de estado
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'EXTENSION_STATE_CHANGED') {
        hoverVoiceState = request.payload;
        if (hoverVoiceState.enabled) {
            initializeListeners();
        } else {
            removeListeners();
            speechSynthesis.cancel();
        }
    }
});

// Inicializar listeners
function initializeListeners() {
    // Elementos que devem ser narrados
    const selectorsToListen = [
        'p', 'span', 'a', 'button', 
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'li', 'td', 'th', 'label', 'input[type="button"]', 'input[type="submit"]',
        '[role="button"]', '[role="link"]', '[role="heading"]',
        'img', 'svg'
    ];

    const elements = document.querySelectorAll(selectorsToListen.join(', '));
    
    elements.forEach(element => {
        element.addEventListener('mouseenter', handleMouseEnter);
        element.addEventListener('mouseleave', handleMouseLeave);
        element.addEventListener('focus', handleFocus);
        element.addEventListener('blur', handleBlur);
    });

    // Também observar elementos adicionados dinamicamente
    observeDOM();
}

// Remover listeners
function removeListeners() {
    const selectorsToListen = [
        'p', 'span', 'a', 'button', 
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'li', 'td', 'th', 'label', 'input[type="button"]', 'input[type="submit"]',
        '[role="button"]', '[role="link"]', '[role="heading"]',
        'img', 'svg'
    ];

    const elements = document.querySelectorAll(selectorsToListen.join(', '));
    
    elements.forEach(element => {
        element.removeEventListener('mouseenter', handleMouseEnter);
        element.removeEventListener('mouseleave', handleMouseLeave);
        element.removeEventListener('focus', handleFocus);
        element.removeEventListener('blur', handleBlur);
    });
}

// Observar DOM para elementos adicionados dinamicamente
let observer;

function observeDOM() {
    if (observer) {
        observer.disconnect();
    }

    observer = new MutationObserver(() => {
        if (hoverVoiceState.enabled) {
            initializeListeners();
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: false,
        characterData: false
    });
}

// Handlers
function handleMouseEnter(event) {
    if (!hoverVoiceState.enabled) return;
    
    const element = event.target;
    const text = getElementText(element);
    
    if (text && !hoveredElements.has(element)) {
        hoveredElements.add(element);
        speak(text);
    }
}

function handleMouseLeave(event) {
    if (!hoverVoiceState.enabled) return;
    
    const element = event.target;
    hoveredElements.delete(element);
}

function handleFocus(event) {
    if (!hoverVoiceState.enabled) return;
    
    const element = event.target;
    const text = getElementText(element);
    
    if (text) {
        speak(text);
    }
}

function handleBlur(event) {
    if (!hoverVoiceState.enabled) return;
    
    // Opcional: cancelar fala ao perder foco
    // speechSynthesis.cancel();
}

// Extrair texto do elemento
function getElementText(element) {
    // Se for imagem, usar alt text
    if (element.tagName === 'IMG') {
        return element.alt || element.title || 'Imagem';
    }

    // Se for SVG com título
    if (element.tagName === 'SVG' || element.tagName === 'svg') {
        const title = element.querySelector('title');
        if (title) {
            return title.textContent;
        }
    }

    // Se for input, usar label ou placeholder
    if (element.tagName === 'INPUT') {
        const label = document.querySelector(`label[for="${element.id}"]`);
        if (label) {
            return label.textContent;
        }
        return element.placeholder || element.value || element.type;
    }

    // Para elementos com atributo aria-label
    if (element.hasAttribute('aria-label')) {
        return element.getAttribute('aria-label');
    }

    // Para elementos com title
    if (element.title) {
        return element.title;
    }

    // Pegar o texto do elemento
    let text = element.textContent || element.innerText;
    
    if (text) {
        // Limpar o texto
        text = text
            .trim()
            .replace(/\s+/g, ' ')
            .substring(0, 500); // Limitar a 500 caracteres
        
        if (text.length > 0) {
            return text;
        }
    }

    return null;
}

// Síntese de voz
function speak(text) {
    if (isProcessing || !text) return;

    isProcessing = true;

    // Cancelar fala anterior se houver
    speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = hoverVoiceState.language;
    utterance.rate = hoverVoiceState.voiceRate;
    utterance.pitch = hoverVoiceState.voicePitch;
    utterance.volume = hoverVoiceState.voiceVolume;

    utterance.onstart = () => {
        // Adicionar classe visual de fala
        hoveredElements.forEach(el => {
            el.classList.add('hovervoice-speaking');
        });
    };

    utterance.onend = () => {
        // Remover classe visual
        hoveredElements.forEach(el => {
            el.classList.remove('hovervoice-speaking');
        });
        isProcessing = false;
    };

    utterance.onerror = () => {
        isProcessing = false;
    };

    speechSynthesis.speak(utterance);
}

// Injetar CSS para feedback visual
function injectStyles() {
    if (document.getElementById('hovervoice-styles')) return;

    const style = document.createElement('style');
    style.id = 'hovervoice-styles';
    style.textContent = `
        .hovervoice-speaking {
            outline: 2px solid rgba(0, 168, 232, 0.5);
            outline-offset: 2px;
            background-color: rgba(0, 168, 232, 0.1);
            transition: all 0.2s ease;
        }

        .hovervoice-speaking::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: radial-gradient(circle, rgba(0, 168, 232, 0.3) 0%, transparent 70%);
            pointer-events: none;
            animation: hovervoice-pulse 1.5s infinite;
        }

        @keyframes hovervoice-pulse {
            0%, 100% {
                opacity: 0.5;
            }
            50% {
                opacity: 1;
            }
        }
    `;
    document.head.appendChild(style);
}

// Injetar estilos ao carregar
injectStyles();

// Inicializar ao carregar documento
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        if (hoverVoiceState.enabled) {
            initializeListeners();
        }
    });
} else {
    if (hoverVoiceState.enabled) {
        initializeListeners();
    }
}

// Limpar ao descarregar
window.addEventListener('beforeunload', () => {
    if (observer) {
        observer.disconnect();
    }
    speechSynthesis.cancel();
});
