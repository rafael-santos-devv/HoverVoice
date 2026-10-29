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
        skipButton: document.getElementById('botaoSemConta')
    };

    const LOGIN_ERRORS = {
        'not-configured': 'Login com Google ainda não configurado.',
        network: 'Sem conexão com o servidor. Suas preferências locais continuam salvas.',
        google: 'O Google não concluiu o login. Tente de novo.',
        server: 'O servidor não respondeu como esperado. Tente mais tarde.'
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
            showMessage('Não foi possível salvar suas preferências.', 'error');
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

        ui.statusText.textContent = enabled ? 'HoverVoice ativo' : 'HoverVoice inativo';
        ui.statusSubtext.textContent = enabled ? 'Passe o mouse ou use Tab' : 'Ative para ouvir a página';
        ui.chipText.textContent = enabled ? 'Ativo' : 'Inativo';
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

    function render() {
        renderStatus();
        renderPdfSettings();
        renderVoiceSettings();
    }

    // =====================================================================
    // Conta (opcional)
    // =====================================================================

    // Invalida tentativas de login abandonadas (a janela do Google não pode ser cancelada por código).
    let loginAttempt = 0;

    function renderAccount(session) {
        const loggedIn = Boolean(session);
        ui.accountCard.dataset.logado = String(loggedIn);
        ui.accountLoggedOut.hidden = loggedIn;
        ui.accountLoggedIn.hidden = !loggedIn;
        ui.accountEmail.textContent = session?.email || '';
        ui.accountButton.textContent = loggedIn ? 'Sair' : 'Entrar';
    }

    /** estado: 'entrada' | 'carregando' | 'erro'. */
    function showLoginScreen(estado, errorMessage = '') {
        document.body.dataset.tela = 'login';
        ui.loginScreen.hidden = false;

        const loading = estado === 'carregando';
        ui.loginTitle.textContent = loading ? 'Entrando…' : 'Entrar ou criar conta';
        ui.loginText.textContent = loading
            ? 'Conclua o login na janela do Google.'
            : 'Use sua conta Google. Se for a primeira vez, criamos sua conta automaticamente. Só salvamos suas preferências de voz.';
        ui.loginProgress.hidden = !loading;
        ui.loginError.hidden = estado !== 'erro';
        ui.loginError.textContent = errorMessage;
        ui.googleButton.disabled = loading;
        ui.googleButtonText.textContent = loading ? 'Aguardando o Google…'
            : estado === 'erro' ? 'Tentar novamente' : 'Continuar com Google';
        ui.skipButton.textContent = loading ? 'Cancelar' : 'Agora não, continuar sem conta';
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
            showMessage('Conta conectada. Suas preferências estão sincronizadas.');
        } catch (error) {
            if (attempt !== loginAttempt) return;
            if (error.code === 'cancelled') {
                showLoginScreen('entrada');
                return;
            }
            console.error('[HoverVoice] Falha no login:', error);
            showLoginScreen('erro', LOGIN_ERRORS[error.code] || LOGIN_ERRORS.server);
        }
    }

    async function handleAccountButton() {
        if (ui.accountCard.dataset.logado !== 'true') {
            showLoginScreen('entrada');
            return;
        }
        await auth.signOut();
        renderAccount(null);
        showMessage('Você saiu da conta. Suas preferências continuam neste navegador.');
    }

    /** Envia as preferências de voz à conta, avisando só se algo der errado. */
    async function syncPreferences() {
        try {
            await auth.pushPreferences(state);
        } catch (error) {
            if (error.code === 'expired') renderAccount(null);
            showMessage(error.code === 'expired'
                ? 'Sua sessão expirou. Entre de novo para sincronizar.'
                : 'Sem conexão: suas preferências foram salvas só neste navegador.', 'error');
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
                showMessage('Sua sessão expirou. Entre de novo para sincronizar.', 'error');
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
