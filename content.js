/**
 * HoverVoice — Content Script
 * ---------------------------------------------------------------------
 * Executa em cada página visitada. Identifica o elemento apontado pelo
 * cursor ou pelo foco do teclado, extrai seu conteúdo textual e o emite
 * por síntese de voz.
 *
 * Arquitetura: delegação de eventos. Em vez de registrar listeners em
 * cada elemento da página (custoso e incompatível com conteúdo dinâmico),
 * registram-se dois listeners no próprio document. O elemento alvo é
 * resolvido com Element.closest(), o que garante que apenas o elemento
 * mais específico sob o cursor seja narrado (RN-05).
 */

(() => {
    'use strict';

    // =====================================================================
    // Constantes
    // =====================================================================

    const STORAGE_KEY = 'extensionState';

    const DEFAULT_STATE = Object.freeze({
        enabled: false,
        voiceRate: 1,
        voicePitch: 1,
        voiceVolume: 1,
        language: 'pt-BR'
    });

    /** Elementos passíveis de narração (RF-04). */
    const NARRATABLE_SELECTOR = [
        'p', 'span', 'a', 'button',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'li', 'td', 'th', 'label',
        'input', 'select', 'textarea',
        'img', 'svg',
        '[role="button"]', '[role="link"]', '[role="heading"]'
    ].join(', ');

    /** Limite de caracteres por locução (RN-03). */
    const MAX_TEXT_LENGTH = 500;

    /**
     * Atraso antes de iniciar a locução. Evita disparar fala para cada
     * elemento atravessado durante um movimento rápido do cursor.
     * Somado ao tempo de síntese, mantém a latência abaixo de 300 ms (RNF-01).
     */
    const HOVER_DELAY_MS = 120;

    const HIGHLIGHT_CLASS = 'hovervoice-speaking';
    const STYLE_ELEMENT_ID = 'hovervoice-styles';

    const RATE_RANGE = { min: 0.5, max: 2 };
    const PITCH_RANGE = { min: 0.5, max: 2 };
    const VOLUME_RANGE = { min: 0, max: 1 };

    // =====================================================================
    // Estado interno
    // =====================================================================

    let state = { ...DEFAULT_STATE };
    let highlightedElement = null;
    let lastNarratedElement = null;
    let hoverTimer = null;

    // =====================================================================
    // Utilitários
    // =====================================================================

    /** Restringe um número a um intervalo. */
    function clamp(value, { min, max }) {
        const number = Number(value);
        if (Number.isNaN(number)) return min;
        return Math.min(Math.max(number, min), max);
    }

    /** Normaliza espaços em branco e aplica o limite de caracteres. */
    function normalizeText(rawText) {
        if (!rawText) return null;
        const text = String(rawText).replace(/\s+/g, ' ').trim();
        if (!text) return null;
        return text.slice(0, MAX_TEXT_LENGTH);
    }

    // =====================================================================
    // Extração de conteúdo (RN-02)
    // =====================================================================

    /** Texto de um elemento de imagem. */
    function textFromImage(element) {
        return element.getAttribute('alt')
            || element.getAttribute('title')
            || 'Imagem sem descrição';
    }

    /** Texto de um elemento SVG, a partir de seu <title>. */
    function textFromSvg(element) {
        const title = element.querySelector('title');
        return title ? title.textContent : null;
    }

    /** Texto de um campo de formulário: rótulo, dica ou tipo. */
    function textFromFormField(element) {
        if (element.id) {
            const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
            if (label) return label.textContent;
        }

        const wrappingLabel = element.closest('label');
        if (wrappingLabel) return wrappingLabel.textContent;

        return element.getAttribute('placeholder')
            || element.getAttribute('title')
            || element.value
            || `Campo do tipo ${element.type || element.tagName.toLowerCase()}`;
    }

    /** Texto referenciado por aria-labelledby. */
    function textFromAriaLabelledBy(element) {
        const ids = element.getAttribute('aria-labelledby');
        if (!ids) return null;

        return ids
            .split(/\s+/)
            .map((id) => document.getElementById(id))
            .filter(Boolean)
            .map((node) => node.textContent)
            .join(' ');
    }

    /**
     * Determina o texto a narrar, seguindo a ordem de precedência da RN-02:
     * aria-label, aria-labelledby, conteúdo específico do tipo de elemento,
     * atributo title e, por fim, o conteúdo textual.
     *
     * @param {Element} element
     * @returns {string|null}
     */
    function extractText(element) {
        const ariaLabel = element.getAttribute('aria-label');
        if (ariaLabel) return normalizeText(ariaLabel);

        const labelledBy = textFromAriaLabelledBy(element);
        if (labelledBy) return normalizeText(labelledBy);

        const tagName = element.tagName.toLowerCase();

        if (tagName === 'img') {
            return normalizeText(textFromImage(element));
        }

        if (tagName === 'svg') {
            const svgText = textFromSvg(element);
            return svgText ? normalizeText(svgText) : null;
        }

        if (tagName === 'input' || tagName === 'select' || tagName === 'textarea') {
            return normalizeText(textFromFormField(element));
        }

        const title = element.getAttribute('title');
        if (title) return normalizeText(title);

        return normalizeText(element.textContent);
    }

    // =====================================================================
    // Realce visual (RF-19)
    // =====================================================================

    function setHighlight(element) {
        clearHighlight();
        if (!element || !element.classList) return;
        element.classList.add(HIGHLIGHT_CLASS);
        highlightedElement = element;
    }

    function clearHighlight() {
        if (highlightedElement && highlightedElement.classList) {
            highlightedElement.classList.remove(HIGHLIGHT_CLASS);
        }
        highlightedElement = null;
    }

    // =====================================================================
    // Síntese de voz
    // =====================================================================

    /** Interrompe qualquer locução em andamento e limpa o realce (RN-08). */
    function stopSpeaking() {
        try {
            window.speechSynthesis.cancel();
        } catch (error) {
            console.error('[HoverVoice] Falha ao cancelar a locução:', error);
        }
        clearHighlight();
    }

    /**
     * Emite uma locução, cancelando a anterior (RN-04).
     * @param {string} text
     * @param {Element|null} element Elemento a realçar durante a fala.
     */
    function speak(text, element = null) {
        if (!text) return;

        stopSpeaking();

        try {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = state.language;
            utterance.rate = clamp(state.voiceRate, RATE_RANGE);
            utterance.pitch = clamp(state.voicePitch, PITCH_RANGE);
            utterance.volume = clamp(state.voiceVolume, VOLUME_RANGE);

            utterance.onstart = () => setHighlight(element);
            utterance.onend = clearHighlight;
            utterance.onerror = (event) => {
                // "interrupted" e "canceled" são esperados na troca de elementos.
                if (event.error !== 'interrupted' && event.error !== 'canceled') {
                    console.error('[HoverVoice] Erro na síntese de voz:', event.error);
                }
                clearHighlight();
            };

            window.speechSynthesis.speak(utterance);
        } catch (error) {
            // RNF-15: falha do sintetizador não deve interromper a navegação.
            console.error('[HoverVoice] Sintetizador indisponível:', error);
            clearHighlight();
        }
    }

    // =====================================================================
    // Narração
    // =====================================================================

    function cancelPendingNarration() {
        if (hoverTimer !== null) {
            clearTimeout(hoverTimer);
            hoverTimer = null;
        }
    }

    /** Agenda a narração de um elemento, aplicando o atraso de estabilização. */
    function scheduleNarration(element) {
        cancelPendingNarration();
        hoverTimer = setTimeout(() => {
            hoverTimer = null;
            narrate(element);
        }, HOVER_DELAY_MS);
    }

    /** Narra imediatamente o elemento informado. */
    function narrate(element) {
        if (!state.enabled || !element || !element.isConnected) return;

        const text = extractText(element);
        if (!text) return;

        lastNarratedElement = element;
        speak(text, element);
    }

    // =====================================================================
    // Manipuladores de eventos
    // =====================================================================

    /**
     * Resolve o elemento narrável mais específico a partir do alvo do evento.
     * @param {EventTarget} target
     * @returns {Element|null}
     */
    function resolveNarratableElement(target) {
        if (!(target instanceof Element)) return null;
        return target.closest(NARRATABLE_SELECTOR);
    }

    /** Narração ao passar o cursor (RF-04). */
    function handlePointerOver(event) {
        if (!state.enabled) return;

        const element = resolveNarratableElement(event.target);
        if (!element || element === lastNarratedElement) return;

        scheduleNarration(element);
    }

    /** Narração ao receber o foco do teclado (RF-05). */
    function handleFocusIn(event) {
        if (!state.enabled) return;

        const element = resolveNarratableElement(event.target);
        if (!element) return;

        cancelPendingNarration();
        narrate(element);
    }

    /** Ao sair da página, encerra qualquer locução pendente. */
    function handlePageHide() {
        cancelPendingNarration();
        stopSpeaking();
    }

    // =====================================================================
    // Estilos injetados
    // =====================================================================

    /**
     * Injeta o realce visual. Usa apenas outline e background, propriedades
     * que não afetam o fluxo do layout da página hospedeira (RNF-11).
     */
    function injectStyles() {
        if (!document.head || document.getElementById(STYLE_ELEMENT_ID)) return;

        const style = document.createElement('style');
        style.id = STYLE_ELEMENT_ID;
        style.textContent = `
            .${HIGHLIGHT_CLASS} {
                outline: 2px solid rgba(0, 168, 232, 0.75) !important;
                outline-offset: 2px !important;
                background-color: rgba(0, 168, 232, 0.12) !important;
                transition: outline-color 0.15s ease, background-color 0.15s ease;
            }

            @media (prefers-reduced-motion: reduce) {
                .${HIGHLIGHT_CLASS} {
                    transition: none;
                }
            }
        `;
        document.head.appendChild(style);
    }

    // =====================================================================
    // Sincronização de estado
    // =====================================================================

    /** Carrega o estado persistido, completando campos ausentes. */
    async function loadState() {
        try {
            const result = await chrome.storage.local.get(STORAGE_KEY);
            return { ...DEFAULT_STATE, ...(result[STORAGE_KEY] || {}) };
        } catch (error) {
            console.error('[HoverVoice] Falha ao carregar o estado:', error);
            return { ...DEFAULT_STATE };
        }
    }

    /**
     * Reage a alterações do estado feitas pelo popup ou pelo atalho de teclado.
     * Ao ser desativada, a extensão interrompe a locução em curso (RN-08).
     * Ao ser ativada ou desativada, anuncia a mudança em voz — retorno
     * essencial para quem aciona o atalho sem enxergar a interface.
     */
    function handleStateChange(changes, areaName) {
        if (areaName !== 'local' || !changes[STORAGE_KEY]) return;

        const previousEnabled = state.enabled;
        state = { ...DEFAULT_STATE, ...(changes[STORAGE_KEY].newValue || {}) };

        if (state.enabled === previousEnabled) return;

        cancelPendingNarration();
        lastNarratedElement = null;

        if (state.enabled) {
            speak('HoverVoice ativado');
        } else {
            stopSpeaking();
        }
    }

    // =====================================================================
    // Inicialização
    // =====================================================================

    async function init() {
        state = await loadState();

        injectStyles();

        // Um único par de listeners cobre toda a página, inclusive elementos
        // inseridos dinamicamente depois do carregamento (RF-20).
        document.addEventListener('pointerover', handlePointerOver, true);
        document.addEventListener('focusin', handleFocusIn, true);
        window.addEventListener('pagehide', handlePageHide);

        chrome.storage.onChanged.addListener(handleStateChange);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
