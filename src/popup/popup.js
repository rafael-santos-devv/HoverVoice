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

    const {
        DEFAULT_STATE, RATE_RANGE, PITCH_RANGE, VOLUME_RANGE,
        clamp, readState, writeState, stateFromChange
    } = HoverVoice;
    const auth = HoverVoiceAuth;
    const i18n = HoverVoiceI18n;
    const t = i18n.t;

    const MESSAGE_TIMEOUT_MS = 4000;

    // =====================================================================
    // Elementos da interface
    // =====================================================================

    const ui = {
        toggle: document.getElementById('extensionToggle'),
        pdfAuto: document.getElementById('pdfAutoToggle'),
        statusText: document.getElementById('statusText'),
        statusSubtext: document.getElementById('statusSubtext'),
        chipText: document.getElementById('statusChipText'),
        testInput: document.getElementById('testInput'),
        testButton: document.getElementById('testButton'),
        message: document.getElementById('statusMessage'),
        rate: document.getElementById('voiceRate'),
        pitch: document.getElementById('voicePitch'),
        volume: document.getElementById('voiceVolume'),
        rateValue: document.getElementById('rateValue'),
        pitchValue: document.getElementById('pitchValue'),
        volumeValue: document.getElementById('volumeValue'),
        accountCard: document.getElementById('cartaoConta'),
        accountLoggedOut: document.getElementById('contaSaiu'),
        accountLoggedIn: document.getElementById('contaEntrou'),
        accountEmail: document.getElementById('contaEmail'),
        accountButton: document.getElementById('botaoConta'),
        loginScreen: document.getElementById('telaLogin'),
        loginTitle: document.getElementById('loginTitulo'),
        loginText: document.getElementById('loginTexto'),
        loginError: document.getElementById('loginErro'),
        loginProgress: document.getElementById('loginProgresso'),
        googleButton: document.getElementById('botaoGoogle'),
        googleButtonText: document.getElementById('botaoGoogleTexto'),
        skipButton: document.getElementById('botaoSemConta'),
        voiceLanguageGroup: document.getElementById('voiceLanguageGroup'),
        uiLanguageGroup: document.getElementById('uiLanguageGroup'),
        voiceSelect: document.getElementById('voiceSelect'),
        voiceHint: document.getElementById('voiceHint')
    };

    // =====================================================================
    // Estado interno
    // =====================================================================

    let state = { ...DEFAULT_STATE };
    let messageTimer = null;

    // =====================================================================
    // Utilitários
    // =====================================================================

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

    async function saveState() {
        try {
            await writeState(state);
        } catch (error) {
            console.error('[HoverVoice] Falha ao salvar as preferências:', error);
            showMessage(t('message.saveFailed'), 'error');
        }
    }

    // =====================================================================
    // Atualização da interface
    // =====================================================================

    function renderStatus() {
        const { enabled } = state;
        ui.toggle.checked = enabled;
        ui.toggle.setAttribute('aria-checked', String(enabled));
        document.body.dataset.estado = enabled ? 'ativo' : 'inativo';

        ui.statusText.textContent = t(enabled ? 'status.titleOn' : 'status.titleOff');
        ui.statusSubtext.textContent = t(enabled ? 'status.subOn' : 'status.subOff');
        ui.chipText.textContent = t(enabled ? 'status.on' : 'status.off');
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

        [[ui.rate, RATE_RANGE], [ui.pitch, PITCH_RANGE], [ui.volume, VOLUME_RANGE]].forEach(([control, { min, max }]) => {
            control.style.setProperty('--progresso', `${((control.value - min) / (max - min)) * 100}%`);
        });
    }

    /** Idioma cuja voz está em uso na tela: o fixo ou, no automático, o da interface. */
    function displayedVoiceLanguage() {
        return i18n.normalize(state.voiceLanguage === 'auto' ? null : state.voiceLanguage) || i18n.getLanguage();
    }

    function renderSegments(group, value) {
        group.querySelectorAll('button').forEach((button) => {
            button.setAttribute('aria-pressed', String(button.dataset.value === value));
        });
    }

    // Uma geração por chamada: a lista de vozes chega depois e só a mais recente vale.
    let voiceRender = 0;

    async function renderVoiceChoice() {
        const generation = ++voiceRender;
        const language = displayedVoiceLanguage();
        const voices = await HoverVoiceVoice.loadVoices(language);
        if (generation !== voiceRender) return;

        const options = [new Option(t('settings.voiceDefault'), '')];
        voices.forEach((voice) => options.push(new Option(`${voice.name} · ${voice.lang}`, voice.voiceURI)));
        ui.voiceSelect.replaceChildren(...options);
        ui.voiceSelect.value = voices.some((voice) => voice.voiceURI === state.voices?.[language])
            ? state.voices[language]
            : '';
        ui.voiceHint.textContent = voices.length
            ? t('settings.voiceHint', { language: t(`lang.${language}`) })
            : t('settings.noVoices');
    }

    function renderLanguage() {
        renderSegments(ui.uiLanguageGroup, i18n.getLanguage());
        renderSegments(ui.voiceLanguageGroup, state.voiceLanguage);
        renderVoiceChoice();
    }

    function render() {
        i18n.setFromState(state);
        i18n.apply();
        renderStatus();
        renderPdfSettings();
        renderVoiceSettings();
        renderLanguage();
        renderAccount(currentSession);
        if (!ui.loginScreen.hidden) showLoginScreen(loginView.estado, loginView.errorCode);
    }

    // =====================================================================
    // Conta (opcional)
    // =====================================================================

    // Invalida tentativas de login abandonadas (a janela do Google não pode ser cancelada por código).
    let loginAttempt = 0;
    let currentSession = null;
    let loginView = { estado: 'entrada', errorCode: '' };

    function renderAccount(session) {
        currentSession = session;
        const loggedIn = Boolean(session);
        ui.accountCard.dataset.logado = String(loggedIn);
        ui.accountLoggedOut.hidden = loggedIn;
        ui.accountLoggedIn.hidden = !loggedIn;
        ui.accountEmail.textContent = session?.email || '';
        ui.accountButton.textContent = t(loggedIn ? 'account.signOut' : 'account.signIn');
    }

    /** estado: 'entrada' | 'carregando' | 'erro' (errorCode: código de HoverVoiceAuth). */
    function showLoginScreen(estado, errorCode = '') {
        loginView = { estado, errorCode };
        document.body.dataset.tela = 'login';
        ui.loginScreen.hidden = false;

        const loading = estado === 'carregando';
        ui.loginTitle.textContent = t(loading ? 'login.titleLoading' : 'login.title');
        ui.loginText.textContent = t(loading ? 'login.textLoading' : 'login.text');
        ui.loginProgress.hidden = !loading;
        ui.loginError.hidden = estado !== 'erro';
        ui.loginError.textContent = errorCode ? t(`login.error.${errorCode}`) : '';
        ui.googleButton.disabled = loading;
        ui.googleButtonText.textContent = t(loading ? 'login.googleLoading' : estado === 'erro' ? 'login.retry' : 'login.google');
        ui.skipButton.textContent = t(loading ? 'login.cancel' : 'login.skip');
        (loading ? ui.skipButton : ui.googleButton).focus();
    }

    function closeLoginScreen() {
        loginAttempt += 1;
        delete document.body.dataset.tela;
        ui.loginScreen.hidden = true;
        ui.accountButton.focus();
    }

    /** Aplica as preferências da conta; se a conta é nova, envia as locais. */
    async function adoptAccountPreferences(remote) {
        if (!remote) {
            await auth.pushPreferences(state);
            return;
        }
        state = { ...state, ...remote };
        renderVoiceSettings();
        await saveState();
    }

    async function handleGoogleSignIn() {
        const attempt = ++loginAttempt;
        showLoginScreen('carregando');
        try {
            const { preferences } = await auth.signInWithGoogle();
            if (attempt !== loginAttempt) return;
            await adoptAccountPreferences(preferences);
            renderAccount(await auth.readSession());
            closeLoginScreen();
            showMessage(t('message.connected'));
        } catch (error) {
            if (attempt !== loginAttempt) return;
            if (error.code === 'cancelled') {
                showLoginScreen('entrada');
                return;
            }
            console.error('[HoverVoice] Falha no login:', error);
            showLoginScreen('erro', ['not-configured', 'network', 'google'].includes(error.code) ? error.code : 'server');
        }
    }

    async function handleAccountButton() {
        if (ui.accountCard.dataset.logado !== 'true') {
            showLoginScreen('entrada');
            return;
        }
        await auth.signOut();
        renderAccount(null);
        showMessage(t('message.signedOut'));
    }

    /** Envia as preferências de voz à conta, avisando só se algo der errado. */
    async function syncPreferences() {
        try {
            await auth.pushPreferences(state);
        } catch (error) {
            if (error.code === 'expired') renderAccount(null);
            showMessage(t(error.code === 'expired' ? 'message.sessionExpired' : 'message.syncOffline'), 'error');
        }
    }

    /** Ao abrir o popup, a conta é a fonte dos campos sincronizados. */
    async function restoreSession() {
        const session = await auth.readSession();
        renderAccount(session);
        if (!session) return;

        try {
            const remote = await auth.pullPreferences();
            if (remote) {
                state = { ...state, ...remote };
                renderVoiceSettings();
                await saveState();
            }
        } catch (error) {
            if (error.code === 'expired') {
                renderAccount(null);
                showMessage(t('message.sessionExpired'), 'error');
            }
        }
    }

    // =====================================================================
    // Síntese de voz (teste)
    // =====================================================================

    function speak(text) {
        if (!text) return;

        try {
            window.speechSynthesis.cancel();

            const utterance = HoverVoiceVoice.createUtterance(text, state);

            utterance.onerror = (event) => {
                if (event.error !== 'interrupted' && event.error !== 'canceled') {
                    showMessage(t('message.audioFailed'), 'error');
                }
            };

            window.speechSynthesis.speak(utterance);
        } catch (error) {
            console.error('[HoverVoice] Sintetizador indisponível:', error);
            showMessage(t('message.noSynth'), 'error');
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
            showMessage(t('message.typeText'), 'error');
            ui.testInput.focus();
            return;
        }

        speak(text);
    }

    async function handleUiLanguage(event) {
        const button = event.target.closest('button[data-value]');
        if (!button) return;
        state = { ...state, uiLanguage: button.dataset.value };
        render();
        await saveState();
    }

    async function handleVoiceLanguage(event) {
        const button = event.target.closest('button[data-value]');
        if (!button) return;
        state = { ...state, voiceLanguage: button.dataset.value };
        renderLanguage();
        await saveState();
    }

    async function handleVoiceChoice() {
        const language = displayedVoiceLanguage();
        state = { ...state, voices: { ...state.voices, [language]: ui.voiceSelect.value } };
        await saveState();
    }

    /** Mantém o popup sincronizado caso o estado mude pelo atalho de teclado. */
    function handleExternalStateChange(changes, areaName) {
        const newState = stateFromChange(changes, areaName);
        if (!newState) return;

        state = newState;
        render();
    }

    // =====================================================================
    // Inicialização
    // =====================================================================

    function attachListeners() {
        ui.toggle.addEventListener('change', handleToggle);
        ui.pdfAuto.addEventListener('change', handlePdfAutoChange);
        ui.testButton.addEventListener('click', handleTestVoice);
        ui.uiLanguageGroup.addEventListener('click', handleUiLanguage);
        ui.voiceLanguageGroup.addEventListener('click', handleVoiceLanguage);
        ui.voiceSelect.addEventListener('change', handleVoiceChoice);

        [ui.rate, ui.pitch, ui.volume].forEach((control) => {
            control.addEventListener('input', handleVoiceSettingsChange);
            control.addEventListener('change', syncPreferences);
        });

        ui.accountButton.addEventListener('click', handleAccountButton);
        ui.googleButton.addEventListener('click', handleGoogleSignIn);
        ui.skipButton.addEventListener('click', closeLoginScreen);

        chrome.storage.onChanged.addListener(handleExternalStateChange);
    }

    async function init() {
        state = await readState();
        render();
        attachListeners();
        await restoreSession();
    }

    init();
})();
