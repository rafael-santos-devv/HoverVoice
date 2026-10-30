/**
 * HoverVoice — Login opcional com Google e sincronização das preferências de voz.
 * Script comum (como state.js): publica o global `HoverVoiceAuth`.
 *
 * Fluxo: chrome.identity abre o login do Google e devolve um ID token; o backend
 * valida o token e devolve um token de sessão próprio. Só esse token (e o e-mail,
 * para exibir) fica em chrome.storage.local, na chave `authSession`. A extensão
 * nunca guarda senha nem chaves secretas. O Client ID do Google não é segredo.
 */

'use strict';

globalThis.HoverVoiceAuth = (() => {
    // Preencher ao publicar. Fora de localhost, usar sempre HTTPS.
    const API_BASE_URL = 'http://localhost:3000';
    const GOOGLE_CLIENT_ID = '';

    // Sem Client ID o login fica desativado e a interface o esconde (a extensão funciona só com preferências locais).
    const isConfigured = () => Boolean(GOOGLE_CLIENT_ID);

    const SESSION_KEY = 'authSession';
    const SYNCED_FIELDS = ['voiceRate', 'voicePitch', 'voiceVolume'];

    /** Erro com `code` estável para a interface escolher a mensagem. */
    const fail = (code, message) => Object.assign(new Error(message), { code });

    async function readSession() {
        const result = await chrome.storage.local.get(SESSION_KEY);
        return result[SESSION_KEY] || null;
    }

    const clearSession = () => chrome.storage.local.remove(SESSION_KEY);

    async function request(path, { method = 'GET', token, body } = {}) {
        let response;
        try {
            response = await fetch(API_BASE_URL + path, {
                method,
                headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
                body: body && JSON.stringify(body)
            });
        } catch {
            throw fail('network', 'Sem conexão com o servidor.');
        }
        if (response.status === 401 && token) {
            await clearSession();
            throw fail('expired', 'Sua sessão expirou.');
        }
        if (!response.ok) throw fail('server', 'O servidor não respondeu como esperado.');
        return response.json();
    }

    /** Abre o login do Google e devolve o ID token (com o nonce usado). */
    async function requestGoogleIdToken() {
        if (!GOOGLE_CLIENT_ID) throw fail('not-configured', 'Login com Google ainda não configurado.');

        const nonce = crypto.randomUUID();
        const params = new URLSearchParams({
            client_id: GOOGLE_CLIENT_ID,
            response_type: 'id_token',
            redirect_uri: chrome.identity.getRedirectURL(),
            scope: 'openid email',
            nonce,
            prompt: 'select_account'
        });

        let redirect;
        try {
            redirect = await chrome.identity.launchWebAuthFlow({
                url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
                interactive: true
            });
        } catch {
            throw fail('cancelled', 'Login cancelado.');
        }

        const idToken = new URLSearchParams(new URL(redirect).hash.slice(1)).get('id_token');
        if (!idToken) throw fail('google', 'O Google não concluiu o login.');
        return { idToken, nonce };
    }

    /**
     * Faz o login e devolve { email, preferences }, onde preferences são as já
     * salvas na conta (ou null se a conta é nova).
     */
    async function signInWithGoogle() {
        const { idToken, nonce } = await requestGoogleIdToken();
        const { token, user, preferences } = await request('/auth/google', { method: 'POST', body: { idToken, nonce } });
        await chrome.storage.local.set({ [SESSION_KEY]: { token, email: user.email } });
        return { email: user.email, preferences };
    }

    async function signOut() {
        const session = await readSession();
        await clearSession();
        if (session) await request('/auth/logout', { method: 'POST', token: session.token }).catch(() => {});
    }

    const pickSynced = (state) => Object.fromEntries(SYNCED_FIELDS.map((field) => [field, state[field]]));

    /** Preferências da conta, ou null se não há sessão ou a conta ainda não tem nenhuma. */
    async function pullPreferences() {
        const session = await readSession();
        if (!session) return null;
        return (await request('/preferences', { token: session.token })).preferences;
    }

    async function pushPreferences(state) {
        const session = await readSession();
        if (!session) return;
        await request('/preferences', { method: 'PUT', token: session.token, body: pickSynced(state) });
    }

    return { SESSION_KEY, isConfigured, readSession, signInWithGoogle, signOut, pullPreferences, pushPreferences };
})();
