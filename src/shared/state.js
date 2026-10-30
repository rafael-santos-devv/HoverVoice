/**
 * HoverVoice — Estado compartilhado
 * ---------------------------------------------------------------------
 * Script comum (sem import/export) para poder ser carregado em todos os
 * contextos da extensão: content_scripts do manifest, <script> do popup e do
 * leitor de PDF e importScripts() no service worker. Publica o namespace
 * global `HoverVoice`.
 *
 * chrome.storage.local, chave `extensionState`, é a única fonte de verdade
 * (RF-02); este módulo concentra leitura, gravação e valores padrão.
 */

'use strict';

globalThis.HoverVoice = (() => {
    const STORAGE_KEY = 'extensionState';

    const DEFAULT_STATE = Object.freeze({
        enabled: false,
        voiceRate: 1,
        voicePitch: 1,
        voiceVolume: 1,
        uiLanguage: null,
        voiceLanguage: 'auto',
        voices: {},
        pdfAutoOpen: true
    });

    const RATE_RANGE = Object.freeze({ min: 0.5, max: 2 });
    const PITCH_RANGE = Object.freeze({ min: 0.5, max: 2 });
    const VOLUME_RANGE = Object.freeze({ min: 0, max: 1 });

    /** Restringe um número a um intervalo; valor inválido vira o mínimo. */
    function clamp(value, { min, max }) {
        const number = Number(value);
        if (Number.isNaN(number)) return min;
        return Math.min(Math.max(number, min), max);
    }

    /** Completa com os valores padrão os campos ausentes do estado salvo. */
    function withDefaults(saved) {
        return { ...DEFAULT_STATE, ...(saved || {}) };
    }

    /** Lê o estado salvo. Em caso de falha, devolve o padrão. */
    async function readState() {
        try {
            const result = await chrome.storage.local.get(STORAGE_KEY);
            return withDefaults(result[STORAGE_KEY]);
        } catch (error) {
            console.error('[HoverVoice] Falha ao ler o estado:', error);
            return withDefaults();
        }
    }

    /** Grava o estado. Propaga o erro para o chamador avisar a pessoa. */
    function writeState(state) {
        return chrome.storage.local.set({ [STORAGE_KEY]: state });
    }

    /**
     * Para uso em chrome.storage.onChanged: devolve o novo estado, ou null
     * quando a mudança não é do estado da extensão.
     */
    function stateFromChange(changes, areaName) {
        if (areaName !== 'local' || !changes[STORAGE_KEY]) return null;
        return withDefaults(changes[STORAGE_KEY].newValue);
    }

    return {
        STORAGE_KEY,
        DEFAULT_STATE,
        RATE_RANGE,
        PITCH_RANGE,
        VOLUME_RANGE,
        clamp,
        withDefaults,
        readState,
        writeState,
        stateFromChange
    };
})();
