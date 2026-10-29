/**
 * HoverVoice — Service Worker (background)
 * ---------------------------------------------------------------------
 * Responsabilidades:
 *   1. Garantir que exista um estado padrão gravado no armazenamento local.
 *   2. Tratar os atalhos de teclado declarados em "commands" no manifest.
 *   3. Encaminhar PDFs para o leitor da extensão (viewer.html), onde o
 *      conteúdo pode ser narrado ao passar o mouse.
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
    language: 'pt-BR',
    pdfAutoOpen: true
});

const VIEWER_PAGE = 'viewer.html';

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

// --- Leitor de PDF -----------------------------------------------------

/** Endereço do leitor, já apontando para o PDF informado. */
function viewerUrl(pdfUrl) {
    const base = chrome.runtime.getURL(VIEWER_PAGE);
    return pdfUrl ? `${base}?file=${encodeURIComponent(pdfUrl)}` : base;
}

/** O caminho da URL termina em .pdf? (ignora parâmetros e fragmento) */
function hasPdfExtension(url) {
    try {
        return /\.pdf$/i.test(new URL(url).pathname);
    } catch {
        return false;
    }
}

/**
 * Descobre se um endereço devolve um PDF, para os casos em que a URL não
 * termina em .pdf. Lê só os cabeçalhos: o corpo é descartado.
 */
async function serverReturnsPdf(url) {
    if (hasPdfExtension(url)) return true;
    if (!/^https?:/i.test(url)) return false;

    try {
        const response = await fetch(url, { credentials: 'include' });
        response.body?.cancel();
        return /pdf/i.test(response.headers.get('content-type') || '');
    } catch {
        return false;
    }
}

/**
 * Quando a pessoa escolhe "Abrir no visualizador do navegador", o endereço
 * fica registrado aqui para que o redirecionamento automático deixe a
 * próxima navegação passar. Usa storage.session porque o service worker
 * pode ser encerrado a qualquer momento.
 */
const bypassKey = (tabId) => `pdfBypass:${tabId}`;

async function consumeBypass(tabId, url) {
    const key = bypassKey(tabId);
    const stored = (await chrome.storage.session.get(key))[key];
    if (stored !== url) return false;
    await chrome.storage.session.remove(key);
    return true;
}

/**
 * Redireciona a aba para o leitor, se a extensão e a abertura automática
 * estiverem ativas.
 */
async function openInViewerIfEnabled(tabId, pdfUrl) {
    const state = await readState();
    if (!state.enabled || !state.pdfAutoOpen) return;
    if (await consumeBypass(tabId, pdfUrl)) return;

    try {
        await chrome.tabs.update(tabId, { url: viewerUrl(pdfUrl) });
    } catch (error) {
        console.error('[HoverVoice] Não foi possível abrir o leitor de PDF:', error);
    }
}

/** Atalho Alt+P: abre no leitor o PDF da aba atual ou, se não houver, um leitor vazio. */
async function openViewerForActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (tab?.url && /^(https?|file):/i.test(tab.url) && await serverReturnsPdf(tab.url)) {
        await chrome.tabs.update(tab.id, { url: viewerUrl(tab.url) });
        return;
    }

    await chrome.tabs.create({ url: viewerUrl(null) });
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
    } else if (command === 'open-pdf-viewer') {
        openViewerForActiveTab();
    }
});

// --- Detecção automática de PDFs ---------------------------------------

/**
 * Observa (sem bloquear) a resposta de cada navegação de página inteira.
 * Se for um PDF para exibição — não um download —, abre o leitor no lugar.
 */
chrome.webRequest.onHeadersReceived.addListener(
    (details) => {
        if (details.tabId < 0 || details.method !== 'GET' || details.statusCode !== 200) return;

        const header = (name) => details.responseHeaders
            ?.find((h) => h.name.toLowerCase() === name)?.value || '';

        const isPdf = /application\/(x-)?pdf/i.test(header('content-type'));
        const isDownload = /^\s*attachment/i.test(header('content-disposition'));

        if (isPdf && !isDownload) {
            openInViewerIfEnabled(details.tabId, details.url);
        }
    },
    { urls: ['http://*/*', 'https://*/*'], types: ['main_frame'] },
    ['responseHeaders']
);

/**
 * Arquivos locais (file://) não passam pelo webRequest. A URL é conferida
 * quando a aba navega. Só funciona se a pessoa ativou "Permitir acesso a
 * URLs de arquivo" nos detalhes da extensão.
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    const url = changeInfo.url;
    if (url && url.startsWith('file:') && hasPdfExtension(url)) {
        openInViewerIfEnabled(tabId, url);
    }
});

// --- Mensagens do leitor -----------------------------------------------

/**
 * O leitor pede para abrir o PDF no visualizador nativo quando não
 * consegue carregá-lo (por exemplo, quando o arquivo exige login).
 */
chrome.runtime.onMessage.addListener((message, sender) => {
    if (message?.type !== 'hovervoice:open-native' || !sender.tab) return;

    const tabId = sender.tab.id;
    chrome.storage.session
        .set({ [bypassKey(tabId)]: message.url })
        .then(() => chrome.tabs.update(tabId, { url: message.url }))
        .catch((error) => console.error('[HoverVoice] Falha ao abrir o visualizador nativo:', error));
});
