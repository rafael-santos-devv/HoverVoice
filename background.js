/**
 * HoverVoice — Service Worker (background)
 * ---------------------------------------------------------------------
 * Responsabilidades:
 *   1. Garantir que exista um estado padrão gravado no armazenamento local.
 *   2. Tratar o atalho de teclado declarado em "commands" no manifest.
 *
 * O estado é a única fonte de verdade da extensão. Tanto o popup quanto o
 * content script observam chrome.storage.onChanged, de modo que qualquer
 * alteração se propaga automaticamente para todas as abas abertas — sem
 * necessidade de envio manual de mensagens.
 */

'use strict';

const STORAGE_KEY = 'extensionState';

const DEFAULT_STATE = Object.freeze({
    enabled: false,
    voiceRate: 1,
    voicePitch: 1,
    voiceVolume: 1,
    language: 'pt-BR'
});

/**
 * Lê o estado salvo, completando com os valores padrão os campos ausentes.
 * @returns {Promise<object>}
 */
async function readState() {
    try {
        const result = await chrome.storage.local.get(STORAGE_KEY);
        return { ...DEFAULT_STATE, ...(result[STORAGE_KEY] || {}) };
    } catch (error) {
        console.error('[HoverVoice] Falha ao ler o estado:', error);
        return { ...DEFAULT_STATE };
    }
}

/**
 * Grava o estado no armazenamento local.
 * @param {object} state
 * @returns {Promise<void>}
 */
async function writeState(state) {
    try {
        await chrome.storage.local.set({ [STORAGE_KEY]: state });
    } catch (error) {
        console.error('[HoverVoice] Falha ao gravar o estado:', error);
    }
}

/** Inverte a situação de ativação da extensão (RF-02). */
async function toggleExtension() {
    const state = await readState();
    await writeState({ ...state, enabled: !state.enabled });
}

// --- Ciclo de vida -----------------------------------------------------

chrome.runtime.onInstalled.addListener(async () => {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    if (!result[STORAGE_KEY]) {
        await writeState({ ...DEFAULT_STATE });
    }
});

// --- Atalhos de teclado ------------------------------------------------

chrome.commands.onCommand.addListener((command) => {
    if (command === 'toggle-extension') {
        toggleExtension();
    }
});
