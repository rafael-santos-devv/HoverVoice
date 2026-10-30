/**
 * HoverVoice — Escolha do idioma e da voz de narração.
 * Script comum: publica o global `HoverVoiceVoice`. Depende de state.js e i18n.js.
 */

'use strict';

globalThis.HoverVoiceVoice = (() => {
    const { RATE_RANGE, PITCH_RANGE, VOLUME_RANGE, clamp } = HoverVoice;
    const LANGUAGE_TAGS = { pt: 'pt-BR', en: 'en-US', es: 'es-ES' };

    /**
     * Idioma da fala (pt, en ou es). Fixo, se a pessoa escolheu um; no
     * automático vale o `lang` do elemento ou da página e, na falta dele,
     * o idioma da interface.
     */
    function resolveLanguage(state, element = null) {
        const fixed = HoverVoiceI18n.normalize(state.voiceLanguage === 'auto' ? null : state.voiceLanguage);
        if (fixed) return fixed;

        const declared = element?.closest?.('[lang]')?.getAttribute('lang') || document.documentElement.lang;
        return HoverVoiceI18n.normalize(declared) || HoverVoiceI18n.getLanguage();
    }

    const voicesFor = (language) => speechSynthesis.getVoices()
        .filter((voice) => voice.lang.toLowerCase().startsWith(language));

    /** A voz escolhida para o idioma ou, se ela sumiu, a voz padrão do navegador (null). */
    function pickVoice(state, language) {
        const wanted = state.voices?.[language];
        return voicesFor(language).find((voice) => voice.voiceURI === wanted) || null;
    }

    /** A lista de vozes carrega depois da página; espera o evento quando ainda está vazia. */
    function loadVoices(language) {
        return new Promise((resolve) => {
            if (speechSynthesis.getVoices().length) {
                resolve(voicesFor(language));
                return;
            }
            speechSynthesis.addEventListener('voiceschanged', () => resolve(voicesFor(language)), { once: true });
            setTimeout(() => resolve(voicesFor(language)), 1500);
        });
    }

    function createUtterance(text, state, element = null) {
        const language = resolveLanguage(state, element);
        const voice = pickVoice(state, language);
        const utterance = new SpeechSynthesisUtterance(text);

        utterance.lang = voice ? voice.lang : LANGUAGE_TAGS[language];
        if (voice) utterance.voice = voice;
        utterance.rate = clamp(state.voiceRate, RATE_RANGE);
        utterance.pitch = clamp(state.voicePitch, PITCH_RANGE);
        utterance.volume = clamp(state.voiceVolume, VOLUME_RANGE);
        return utterance;
    }

    return { LANGUAGE_TAGS, resolveLanguage, loadVoices, createUtterance };
})();
