/**
 * HoverVoice — Lógica da interface (popup)
 * ---------------------------------------------------------------------
 * Controla a ativação da extensão e as preferências de voz. Todas as
 * alterações são gravadas no armazenamento local; o content script observa
 * chrome.storage.onChanged e se atualiza automaticamente, sem necessidade
 * de envio manual de mensagens para as abas.
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
        language: 'pt-BR',
        pdfAutoOpen: true
    });

    const RATE_RANGE = { min: 0.5, max: 2 };
    const PITCH_RANGE = { min: 0.5, max: 2 };
    const VOLUME_RANGE = { min: 0, max: 1 };

    const MESSAGE_TIMEOUT_MS = 4000;

    // =====================================================================
    // Elementos da interface
    // =====================================================================

    const ui = {
        toggle: document.getElementById('extensionToggle'),
        pdfAuto: document.getElementById('pdfAutoToggle'),
        statusText: document.getElementById('statusText'),
        statusSubtext: document.getElementById('statusSubtext'),
        testInput: document.getElementById('testInput'),
        testButton: document.getElementById('testButton'),
        message: document.getElementById('statusMessage'),
        rate: document.getElementById('voiceRate'),
        pitch: document.getElementById('voicePitch'),
        volume: document.getElementById('voiceVolume'),
        rateValue: document.getElementById('rateValue'),
        pitchValue: document.getElementById('pitchValue'),
        volumeValue: document.getElementById('volumeValue')
    };

    // =====================================================================
    // Estado interno
    // =====================================================================

    let state = { ...DEFAULT_STATE };
    let messageTimer = null;

    // =====================================================================
    // Utilitários
    // =====================================================================

    function clamp(value, { min, max }) {
        const number = Number(value);
        if (Number.isNaN(number)) return min;
        return Math.min(Math.max(number, min), max);
    }

    /**
     * Exibe uma mensagem na própria interface. Substitui o uso de alert(),
     * que bloqueia a janela e não é anunciado por leitores de tela.
     * @param {string} text
     * @param {'info'|'error'} type
     */
    function showMessage(text, type = 'info') {
        if (!ui.message) return;

        clearTimeout(messageTimer);
        ui.message.textContent = text;
        ui.message.dataset.type = type;
        ui.message.hidden = false;

        messageTimer = setTimeout(() => {
            ui.message.hidden = true;
            ui.message.textContent = '';
        }, MESSAGE_TIMEOUT_MS);
    }

    // =====================================================================
    // Persistência
    // =====================================================================

    async function loadState() {
        try {
            const result = await chrome.storage.local.get(STORAGE_KEY);
            return { ...DEFAULT_STATE, ...(result[STORAGE_KEY] || {}) };
        } catch (error) {
            console.error('[HoverVoice] Falha ao carregar as preferências:', error);
            showMessage('Não foi possível carregar suas preferências.', 'error');
            return { ...DEFAULT_STATE };
        }
    }

    async function saveState() {
        try {
            await chrome.storage.local.set({ [STORAGE_KEY]: state });
        } catch (error) {
            console.error('[HoverVoice] Falha ao salvar as preferências:', error);
            showMessage('Não foi possível salvar suas preferências.', 'error');
        }
    }

    // =====================================================================
    // Atualização da interface
    // =====================================================================

    function renderStatus() {
        ui.toggle.checked = state.enabled;
        ui.toggle.setAttribute('aria-checked', String(state.enabled));

        if (state.enabled) {
            ui.statusText.textContent = 'HoverVoice Ativo';
            ui.statusSubtext.textContent = 'Passe o mouse para ouvir';
        } else {
            ui.statusText.textContent = 'HoverVoice Inativo';
            ui.statusSubtext.textContent = 'Clique para ativar';
        }
    }

    function renderPdfSettings() {
        ui.pdfAuto.checked = Boolean(state.pdfAutoOpen);
    }

    function renderVoiceSettings() {
        ui.rate.value = state.voiceRate;
        ui.pitch.value = state.voicePitch;
        ui.volume.value = state.voiceVolume;

        ui.rateValue.textContent = `${state.voiceRate.toFixed(1)}x`;
        ui.pitchValue.textContent = `${state.voicePitch.toFixed(1)}x`;
        ui.volumeValue.textContent = `${Math.round(state.voiceVolume * 100)}%`;
    }

    function render() {
        renderStatus();
        renderPdfSettings();
        renderVoiceSettings();
    }

    // =====================================================================
    // Síntese de voz (teste)
    // =====================================================================

    function speak(text) {
        if (!text) return;

        try {
            window.speechSynthesis.cancel();

            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = state.language;
            utterance.rate = clamp(state.voiceRate, RATE_RANGE);
            utterance.pitch = clamp(state.voicePitch, PITCH_RANGE);
            utterance.volume = clamp(state.voiceVolume, VOLUME_RANGE);

            utterance.onerror = (event) => {
                if (event.error !== 'interrupted' && event.error !== 'canceled') {
                    showMessage('Não foi possível reproduzir o áudio.', 'error');
                }
            };

            window.speechSynthesis.speak(utterance);
        } catch (error) {
            console.error('[HoverVoice] Sintetizador indisponível:', error);
            showMessage('A síntese de voz não está disponível neste navegador.', 'error');
        }
    }

    // =====================================================================
    // Manipuladores de eventos
    // =====================================================================

    async function handleToggle() {
        state = { ...state, enabled: ui.toggle.checked };
        renderStatus();
        await saveState();
    }

    async function handlePdfAutoChange() {
        state = { ...state, pdfAutoOpen: ui.pdfAuto.checked };
        await saveState();
    }

    async function handleVoiceSettingsChange() {
        state = {
            ...state,
            voiceRate: clamp(ui.rate.value, RATE_RANGE),
            voicePitch: clamp(ui.pitch.value, PITCH_RANGE),
            voiceVolume: clamp(ui.volume.value, VOLUME_RANGE)
        };

        renderVoiceSettings();
        await saveState();
    }

    function handleTestVoice() {
        const text = ui.testInput.value.trim();

        if (!text) {
            showMessage('Digite um texto para testar a voz.', 'error');
            ui.testInput.focus();
            return;
        }

        speak(text);
    }

    /** Mantém o popup sincronizado caso o estado mude pelo atalho de teclado. */
    function handleExternalStateChange(changes, areaName) {
        if (areaName !== 'local' || !changes[STORAGE_KEY]) return;

        state = { ...DEFAULT_STATE, ...(changes[STORAGE_KEY].newValue || {}) };
        render();
    }

    // =====================================================================
    // Inicialização
    // =====================================================================

    function attachListeners() {
        ui.toggle.addEventListener('change', handleToggle);
        ui.pdfAuto.addEventListener('change', handlePdfAutoChange);
        ui.testButton.addEventListener('click', handleTestVoice);

        [ui.rate, ui.pitch, ui.volume].forEach((control) => {
            control.addEventListener('input', handleVoiceSettingsChange);
        });

        chrome.storage.onChanged.addListener(handleExternalStateChange);
    }

    async function init() {
        state = await loadState();
        render();
        attachListeners();
    }

    init();
})();
