/**
 * HoverVoice — Leitor de PDF
 * ---------------------------------------------------------------------
 * Abre um PDF dentro da própria extensão. O visualizador nativo do Chrome
 * é isolado: nenhum content script alcança o texto nele exibido. Aqui o
 * PDF é desenhado com o PDF.js e, sobre cada página, é posicionada uma
 * camada de BLOCOS transparentes (um por parágrafo). Cada bloco carrega o
 * texto do parágrafo e é um elemento comum do DOM — portanto o content.js,
 * que já trata mouse e teclado, passa a narrá-lo sem nenhuma lógica extra.
 *
 * Fluxo:
 *   1. Obtém os bytes do PDF (URL recebida pelo parâmetro ?file= ou arquivo
 *      escolhido pela pessoa).
 *   2. Cria um espaço reservado por página, com o tamanho correto.
 *   3. Desenha cada página só quando ela se aproxima da área visível, e
 *      libera as páginas distantes para não esgotar a memória.
 */

import * as pdfjsLib from './lib/pdf.min.mjs';
import { buildBlocks } from './pdf-blocks.js';

// =========================================================================
// Constantes
// =========================================================================

const STORAGE_KEY = 'extensionState';

const DEFAULT_STATE = Object.freeze({
    enabled: false,
    voiceRate: 1,
    voicePitch: 1,
    voiceVolume: 1,
    language: 'pt-BR',
    pdfAutoOpen: true
});

const ZOOM_STORAGE_KEY = 'hovervoice.pdfZoom';
const ZOOM_RANGE = { min: 0.5, max: 3 };
const ZOOM_STEP = 0.25;

/** Distância (px) além da área visível em que as páginas já são desenhadas. */
const RENDER_MARGIN = '1200px 0px';

/** Máximo de páginas desenhadas ao mesmo tempo. */
const MAX_RENDERED_PAGES = 10;

/** Resolução máxima do canvas, em relação ao CSS. Limita o uso de memória. */
const MAX_PIXEL_RATIO = 2;

const LIB_URL = (path) => chrome.runtime.getURL(`lib/${path}`);

pdfjsLib.GlobalWorkerOptions.workerSrc = LIB_URL('pdf.worker.min.mjs');

// =========================================================================
// Elementos da interface
// =========================================================================

const ui = {
    titulo: document.getElementById('tituloDocumento'),
    abrir: document.getElementById('botaoAbrir'),
    baixar: document.getElementById('botaoBaixar'),
    zoomMenos: document.getElementById('botaoZoomMenos'),
    zoomMais: document.getElementById('botaoZoomMais'),
    zoomValor: document.getElementById('valorZoom'),
    narracao: document.getElementById('botaoNarracao'),
    narracaoTexto: document.getElementById('textoNarracao'),
    arquivo: document.getElementById('entradaArquivo'),
    mensagem: document.getElementById('mensagem'),
    painel: document.getElementById('painel'),
    painelTitulo: document.getElementById('painelTitulo'),
    painelTexto: document.getElementById('painelTexto'),
    painelAcoes: document.getElementById('painelAcoes'),
    painelAbrir: document.getElementById('painelAbrir'),
    painelNativo: document.getElementById('painelNativo'),
    formSenha: document.getElementById('formularioSenha'),
    campoSenha: document.getElementById('campoSenha'),
    cancelarSenha: document.getElementById('botaoCancelarSenha'),
    documento: document.getElementById('documento')
};

// =========================================================================
// Estado interno
// =========================================================================

let state = { ...DEFAULT_STATE };

let pdf = null;                // PDFDocumentProxy atual
let pdfBlob = null;            // Cópia dos bytes, para "Baixar cópia"
let pdfName = 'documento.pdf';
let sourceUrl = null;          // URL de origem (null quando o arquivo veio do disco)
let pages = [];                // Uma entrada por página: { number, el, status, token, renderTask }
let scale = 1.25;
let baseSize = { width: 612, height: 792 };   // Página 1 em escala 1
let observer = null;
let messageTimer = null;
let loadId = 0;                // Invalida carregamentos antigos quando se abre outro arquivo

// =========================================================================
// Utilitários
// =========================================================================

function clamp(value, { min, max }) {
    return Math.min(Math.max(value, min), max);
}

/**
 * Escolhe o título exibido. Muitos PDFs trazem no metadado um texto sem valor
 * ("(anonymous)", "Microsoft Word - arquivo.docx"); nesses casos vale mais o
 * nome do arquivo.
 */
function pickTitle(metadataTitle, fileName) {
    const title = (metadataTitle || '').trim();
    const generic = /^\(?(anonymous|untitled|sem t[ií]tulo|unknown)\)?$/i.test(title)
        || /^microsoft (word|powerpoint|excel)\s*-/i.test(title)
        || /\.(docx?|pptx?|xlsx?|indd|tex|pdf)$/i.test(title);

    return title && !generic ? title : fileName;
}

function fileNameFromUrl(url) {
    try {
        const last = decodeURIComponent(new URL(url).pathname.split('/').pop() || '');
        return last || 'documento.pdf';
    } catch {
        return 'documento.pdf';
    }
}

/** Mostra uma mensagem na própria interface (anunciada pelo role="status"). */
function showMessage(text, type = 'info', { autoHide = false } = {}) {
    clearTimeout(messageTimer);
    ui.mensagem.textContent = text;
    ui.mensagem.dataset.tipo = type;
    ui.mensagem.hidden = false;

    if (autoHide) {
        messageTimer = setTimeout(() => {
            ui.mensagem.hidden = true;
        }, 8000);
    }
}

function hideMessage() {
    clearTimeout(messageTimer);
    ui.mensagem.hidden = true;
}

/** Fala um aviso curto quando a narração está ligada (mesma voz do content.js). */
function speakNotice(text) {
    if (!state.enabled) return;
    try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = state.language;
        utterance.rate = clamp(Number(state.voiceRate) || 1, { min: 0.5, max: 2 });
        utterance.pitch = clamp(Number(state.voicePitch) || 1, { min: 0.5, max: 2 });
        utterance.volume = clamp(Number(state.voiceVolume) || 1, { min: 0, max: 1 });
        window.speechSynthesis.speak(utterance);
    } catch (error) {
        console.error('[HoverVoice] Sintetizador indisponível:', error);
    }
}

function announce(text, type = 'info') {
    showMessage(text, type, { autoHide: true });
    speakNotice(text);
}

// =========================================================================
// Painel (estado inicial, carregamento, erro e senha)
// =========================================================================

function showPanel({ title, text, canOpenNative = false, showPicker = true, passwordForm = false }) {
    ui.painelTitulo.textContent = title;
    ui.painelTexto.textContent = text;
    ui.painelNativo.hidden = !(canOpenNative && sourceUrl);
    ui.painelAcoes.hidden = passwordForm || (!showPicker && ui.painelNativo.hidden);
    ui.painelAbrir.hidden = !showPicker;
    ui.formSenha.hidden = !passwordForm;
    ui.painel.hidden = false;
    ui.documento.hidden = true;
}

function showDocument() {
    ui.painel.hidden = true;
    ui.documento.hidden = false;
}

function showEmptyPanel() {
    showPanel({
        title: 'Abra um PDF para ouvi-lo',
        text: 'Escolha um arquivo ou arraste-o para esta janela. Depois, passe o mouse sobre o texto ou navegue com a tecla Tab.'
    });
}

function showErrorPanel(title, text, { canOpenNative = false } = {}) {
    showPanel({ title, text, canOpenNative });
    ui.painelTitulo.setAttribute('tabindex', '-1');
    ui.painelTitulo.focus();
    speakNotice(`${title}. ${text}`);
}

/** Pede a senha de um PDF protegido. Devolve a senha ou null se a pessoa cancelar. */
function askPassword(wasIncorrect) {
    return new Promise((resolve) => {
        showPanel({
            title: 'Este PDF é protegido por senha',
            text: wasIncorrect
                ? 'A senha estava incorreta. Digite novamente.'
                : 'Digite a senha para abrir o documento.',
            passwordForm: true
        });
        ui.campoSenha.value = '';
        ui.campoSenha.focus();

        const cleanUp = () => {
            ui.formSenha.removeEventListener('submit', onSubmit);
            ui.cancelarSenha.removeEventListener('click', onCancel);
        };
        const onSubmit = (event) => {
            event.preventDefault();
            const value = ui.campoSenha.value;
            cleanUp();
            resolve(value);
        };
        const onCancel = () => {
            cleanUp();
            resolve(null);
        };

        ui.formSenha.addEventListener('submit', onSubmit);
        ui.cancelarSenha.addEventListener('click', onCancel);
    });
}

// =========================================================================
// Obtenção do PDF
// =========================================================================

class LoadError extends Error {
    constructor(title, text, { canOpenNative = false } = {}) {
        super(text);
        this.title = title;
        this.canOpenNative = canOpenNative;
    }
}

/** Confirma que os bytes são de um PDF (e não, por exemplo, uma página de login). */
function assertIsPdf(buffer) {
    const head = new TextDecoder('latin1').decode(buffer.slice(0, 1024));
    if (!head.includes('%PDF-')) {
        throw new LoadError(
            'Este arquivo não é um PDF',
            'O endereço não devolveu um documento PDF. Se o arquivo exige login, abra-o no visualizador do navegador, salve-o e escolha-o aqui.',
            { canOpenNative: true }
        );
    }
}

async function fetchPdf(url) {
    let response;
    try {
        response = await fetch(url, { credentials: 'include' });
    } catch {
        if (url.startsWith('file:')) {
            throw new LoadError(
                'Não foi possível ler o arquivo local',
                'Para abrir arquivos do computador por endereço, ative "Permitir acesso a URLs de arquivo" nos detalhes da extensão em chrome://extensions. Você também pode usar "Escolher arquivo".'
            );
        }
        throw new LoadError(
            'Não foi possível baixar o PDF',
            'Verifique sua conexão e tente novamente, ou abra o arquivo no visualizador do navegador.',
            { canOpenNative: true }
        );
    }

    if (!response.ok) {
        throw new LoadError(
            'Não foi possível baixar o PDF',
            `O servidor respondeu com o erro ${response.status}.`,
            { canOpenNative: true }
        );
    }

    const buffer = await response.arrayBuffer();
    assertIsPdf(buffer);
    return buffer;
}

// =========================================================================
// Abertura do documento
// =========================================================================

function disposeDocument() {
    if (observer) {
        observer.disconnect();
        observer = null;
    }
    pages.forEach((entry) => entry.renderTask?.cancel());
    pages = [];
    ui.documento.replaceChildren();

    if (pdf) {
        pdf.destroy().catch(() => {});
        pdf = null;
    }
    pdfBlob = null;
}

function setControlsEnabled(enabled) {
    ui.baixar.disabled = !enabled;
    ui.zoomMenos.disabled = !enabled;
    ui.zoomMais.disabled = !enabled;
    ui.zoomValor.textContent = enabled ? `${Math.round(scale * 100)}%` : '—';
}

function loadSavedZoom() {
    try {
        const saved = Number(localStorage.getItem(ZOOM_STORAGE_KEY));
        return saved > 0 ? clamp(saved, ZOOM_RANGE) : null;
    } catch {
        return null;
    }
}

function saveZoom() {
    try {
        localStorage.setItem(ZOOM_STORAGE_KEY, String(scale));
    } catch {
        // Armazenamento indisponível: a preferência apenas não é guardada.
    }
}

/** Escolhe a escala inicial para a página caber na largura da janela. */
function fitWidthScale() {
    const available = Math.max(320, document.documentElement.clientWidth - 64);
    return clamp(Math.round((available / baseSize.width) * 20) / 20, { min: 0.75, max: 1.5 });
}

async function openDocument(bytes, name, origin) {
    const currentLoad = ++loadId;

    disposeDocument();
    setControlsEnabled(false);
    hideMessage();
    showPanel({ title: 'Abrindo o PDF…', text: 'Isso leva só alguns instantes.', showPicker: false });

    pdfName = /\.pdf$/i.test(name) ? name : `${name}.pdf`;
    sourceUrl = origin;
    pdfBlob = new Blob([bytes], { type: 'application/pdf' });

    // O PDF.js assume a posse do buffer; por isso o Blob foi criado antes.
    const loadingTask = pdfjsLib.getDocument({
        data: bytes,
        cMapUrl: LIB_URL('cmaps/'),
        cMapPacked: true,
        standardFontDataUrl: LIB_URL('standard_fonts/'),
        iccUrl: LIB_URL('iccs/'),
        wasmUrl: LIB_URL('wasm/')
    });

    let cancelledByUser = false;
    loadingTask.onPassword = async (updatePassword, reason) => {
        const incorrect = reason === pdfjsLib.PasswordResponses.INCORRECT_PASSWORD;
        const password = await askPassword(incorrect);
        if (password === null) {
            cancelledByUser = true;
            loadingTask.destroy();
        } else {
            updatePassword(password);
        }
    };

    let doc;
    try {
        doc = await loadingTask.promise;
    } catch (error) {
        if (currentLoad !== loadId) return;
        if (cancelledByUser) {
            showEmptyPanel();
            return;
        }
        console.error('[HoverVoice] Falha ao abrir o PDF:', error);
        showErrorPanel(
            'Não foi possível abrir este PDF',
            'O arquivo pode estar corrompido ou usar um formato que o leitor não reconhece.',
            { canOpenNative: true }
        );
        return;
    }

    if (currentLoad !== loadId) {
        doc.destroy().catch(() => {});
        return;
    }

    pdf = doc;

    const firstPage = await pdf.getPage(1);
    const firstViewport = firstPage.getViewport({ scale: 1 });
    baseSize = { width: firstViewport.width, height: firstViewport.height };
    firstPage.cleanup();

    const meta = await pdf.getMetadata().catch(() => null);
    const title = pickTitle(meta?.info?.Title, pdfName);
    ui.titulo.textContent = title;
    ui.titulo.title = title;
    document.title = `${title} — HoverVoice`;

    scale = loadSavedZoom() ?? fitWidthScale();
    buildPages();
    setControlsEnabled(true);
    showDocument();
    startObserving();

    const count = pdf.numPages;
    const pagesLabel = count === 1 ? '1 página' : `${count} páginas`;
    const hint = state.enabled ? '' : ' A narração está desligada: pressione Alt+A para ligá-la.';
    announce(`Documento aberto: ${title}, ${pagesLabel}.${hint}`);
}

/** Cria o espaço reservado de cada página, com o tamanho já definitivo. */
function buildPages() {
    const fragment = document.createDocumentFragment();

    for (let number = 1; number <= pdf.numPages; number += 1) {
        const el = document.createElement('div');
        el.className = 'pagina';
        el.dataset.page = String(number);
        el.setAttribute('role', 'group');
        el.setAttribute('aria-label', `Página ${number} de ${pdf.numPages}`);
        sizePlaceholder(el);

        fragment.appendChild(el);
        pages.push({ number, el, status: 'idle', token: 0, renderTask: null });
    }

    ui.documento.replaceChildren(fragment);
}

function sizePlaceholder(el) {
    el.style.width = `${Math.floor(baseSize.width * scale)}px`;
    el.style.height = `${Math.floor(baseSize.height * scale)}px`;
}

// =========================================================================
// Desenho das páginas (sob demanda)
// =========================================================================

function startObserving() {
    observer?.disconnect();
    observer = new IntersectionObserver((records) => {
        for (const record of records) {
            if (record.isIntersecting) {
                renderPage(pages[Number(record.target.dataset.page) - 1]);
            }
        }
    }, { rootMargin: RENDER_MARGIN });

    pages.forEach((entry) => observer.observe(entry.el));
}

/** Devolve a página ao estado de espaço reservado, liberando a memória do canvas. */
function resetPage(entry) {
    entry.token += 1;
    entry.renderTask?.cancel();
    entry.renderTask = null;
    entry.status = 'idle';

    entry.el.querySelectorAll('canvas').forEach((canvas) => {
        canvas.width = 0;
        canvas.height = 0;
    });
    entry.el.replaceChildren();
}

function createBlock(block, pageNumber) {
    const el = document.createElement('div');
    el.className = 'bloco-pdf';
    el.tabIndex = 0;
    el.dataset.page = String(pageNumber);
    el.textContent = block.text;
    el.style.left = `${block.left}px`;
    el.style.top = `${block.top}px`;
    el.style.width = `${block.width}px`;
    el.style.height = `${block.height}px`;
    return el;
}

async function renderPage(entry) {
    if (!entry || !pdf || entry.status !== 'idle') return;

    entry.status = 'rendering';
    const token = ++entry.token;
    const ownerDocument = pdf;

    try {
        const page = await ownerDocument.getPage(entry.number);
        if (token !== entry.token) return;

        const cssViewport = page.getViewport({ scale });
        const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
        const renderViewport = page.getViewport({ scale: scale * pixelRatio });

        entry.el.style.width = `${Math.floor(cssViewport.width)}px`;
        entry.el.style.height = `${Math.floor(cssViewport.height)}px`;

        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(renderViewport.width);
        canvas.height = Math.floor(renderViewport.height);
        canvas.style.width = `${Math.floor(cssViewport.width)}px`;
        canvas.style.height = `${Math.floor(cssViewport.height)}px`;
        canvas.setAttribute('aria-hidden', 'true');

        const task = page.render({ canvas, viewport: renderViewport });
        entry.renderTask = task;

        const [textContent] = await Promise.all([page.getTextContent(), task.promise]);
        if (token !== entry.token) return;

        const layer = document.createDocumentFragment();
        const blocks = buildBlocks(textContent.items, cssViewport);
        blocks.forEach((block) => layer.appendChild(createBlock(block, entry.number)));

        entry.el.replaceChildren(canvas, layer);
        entry.status = 'done';
        entry.renderTask = null;
        page.cleanup();

        evictDistantPages(entry.number);

        if (entry.number === 1 && blocks.length === 0) {
            showMessage(
                'Esta página não tem texto que possa ser narrado. Se o PDF for escaneado (feito de imagens), a narração não funciona sem reconhecimento de texto (OCR).',
                'aviso'
            );
        }
    } catch (error) {
        if (error?.name === 'RenderingCancelledException') return;
        if (token !== entry.token) return;

        console.error(`[HoverVoice] Falha ao exibir a página ${entry.number}:`, error);
        entry.status = 'error';
        const message = document.createElement('p');
        message.className = 'pagina-erro';
        message.textContent = 'Não foi possível exibir esta página.';
        entry.el.replaceChildren(message);
    }
}

/** Mantém no máximo MAX_RENDERED_PAGES páginas desenhadas, liberando as mais distantes. */
function evictDistantPages(centerNumber) {
    const rendered = pages.filter((entry) => entry.status === 'done');
    let excess = rendered.length - MAX_RENDERED_PAGES;
    if (excess <= 0) return;

    rendered
        .filter((entry) => !entry.el.contains(document.activeElement))
        .sort((a, b) => Math.abs(b.number - centerNumber) - Math.abs(a.number - centerNumber))
        .forEach((entry) => {
            if (excess <= 0) return;
            resetPage(entry);
            excess -= 1;
        });
}

/**
 * Ao receber o foco em uma página, já desenha as vizinhas. Assim a tecla Tab
 * encontra os blocos da página seguinte (e da anterior, com Shift+Tab) sem
 * que a pessoa tenha de rolar a tela antes.
 */
function prepareNeighbours(event) {
    const pageEl = event.target instanceof Element ? event.target.closest('.pagina') : null;
    if (!pageEl) return;

    const number = Number(pageEl.dataset.page);
    [number - 1, number + 1, number + 2].forEach((neighbour) => {
        renderPage(pages[neighbour - 1]);
    });
}

// =========================================================================
// Tamanho (zoom)
// =========================================================================

function changeZoom(delta) {
    if (!pdf) return;

    const next = clamp(Math.round((scale + delta) * 100) / 100, ZOOM_RANGE);
    if (next === scale) return;

    scale = next;
    saveZoom();
    ui.zoomValor.textContent = `${Math.round(scale * 100)}%`;

    // Redesenha tudo na nova escala; o observador desenha de novo o que está visível.
    pages.forEach((entry) => {
        resetPage(entry);
        sizePlaceholder(entry.el);
    });
    startObserving();
}

// =========================================================================
// Arquivos
// =========================================================================

async function openFile(file) {
    if (!file) return;

    const looksLikePdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (!looksLikePdf) {
        showErrorPanel('Este arquivo não é um PDF', `"${file.name}" não parece ser um documento PDF.`);
        return;
    }

    try {
        const buffer = await file.arrayBuffer();
        assertIsPdf(buffer);
        await openDocument(new Uint8Array(buffer), file.name, null);
    } catch (error) {
        showLoadError(error);
    }
}

async function openUrl(url) {
    showPanel({ title: 'Baixando o PDF…', text: 'Isso leva só alguns instantes.', showPicker: false });
    sourceUrl = url;

    try {
        const buffer = await fetchPdf(url);
        await openDocument(new Uint8Array(buffer), fileNameFromUrl(url), url);
    } catch (error) {
        showLoadError(error);
    }
}

function showLoadError(error) {
    if (error instanceof LoadError) {
        showErrorPanel(error.title, error.message, { canOpenNative: error.canOpenNative });
        return;
    }
    console.error('[HoverVoice] Erro inesperado:', error);
    showErrorPanel('Algo deu errado', 'Não foi possível carregar o arquivo.', { canOpenNative: true });
}

function downloadCopy() {
    if (!pdfBlob) return;

    const link = document.createElement('a');
    const objectUrl = URL.createObjectURL(pdfBlob);
    link.href = objectUrl;
    link.download = pdfName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
}

function openInBrowserViewer() {
    if (!sourceUrl) return;
    chrome.runtime.sendMessage({ type: 'hovervoice:open-native', url: sourceUrl });
}

// =========================================================================
// Estado compartilhado com o popup e o content.js
// =========================================================================

async function loadState() {
    try {
        const result = await chrome.storage.local.get(STORAGE_KEY);
        return { ...DEFAULT_STATE, ...(result[STORAGE_KEY] || {}) };
    } catch (error) {
        console.error('[HoverVoice] Falha ao carregar o estado:', error);
        return { ...DEFAULT_STATE };
    }
}

function renderNarrationButton() {
    ui.narracao.setAttribute('aria-pressed', String(state.enabled));
    ui.narracaoTexto.textContent = state.enabled ? 'Narração ligada' : 'Narração desligada';
    document.body.dataset.narracao = state.enabled ? 'ligada' : 'desligada';
}

async function toggleNarration() {
    try {
        await chrome.storage.local.set({ [STORAGE_KEY]: { ...state, enabled: !state.enabled } });
    } catch (error) {
        console.error('[HoverVoice] Falha ao gravar o estado:', error);
        showMessage('Não foi possível alterar a narração.', 'erro');
    }
}

function handleStateChange(changes, areaName) {
    if (areaName !== 'local' || !changes[STORAGE_KEY]) return;
    state = { ...DEFAULT_STATE, ...(changes[STORAGE_KEY].newValue || {}) };
    renderNarrationButton();
}

// =========================================================================
// Arrastar e soltar
// =========================================================================

function hasFiles(event) {
    return Array.from(event.dataTransfer?.types || []).includes('Files');
}

function handleDragOver(event) {
    if (!hasFiles(event)) return;
    event.preventDefault();
    ui.painel.dataset.arrastando = 'true';
}

function handleDragLeave() {
    delete ui.painel.dataset.arrastando;
}

function handleDrop(event) {
    if (!hasFiles(event)) return;
    event.preventDefault();
    delete ui.painel.dataset.arrastando;
    openFile(event.dataTransfer.files[0]);
}

// =========================================================================
// Inicialização
// =========================================================================

function attachListeners() {
    ui.abrir.addEventListener('click', () => ui.arquivo.click());
    ui.painelAbrir.addEventListener('click', () => ui.arquivo.click());
    ui.arquivo.addEventListener('change', () => {
        openFile(ui.arquivo.files[0]);
        ui.arquivo.value = '';
    });

    ui.baixar.addEventListener('click', downloadCopy);
    ui.zoomMenos.addEventListener('click', () => changeZoom(-ZOOM_STEP));
    ui.zoomMais.addEventListener('click', () => changeZoom(ZOOM_STEP));
    ui.narracao.addEventListener('click', toggleNarration);
    ui.painelNativo.addEventListener('click', openInBrowserViewer);

    ui.documento.addEventListener('focusin', prepareNeighbours);

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);

    // Esc interrompe a fala em andamento (o content.js limpa o realce).
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') window.speechSynthesis.cancel();
    });

    chrome.storage.onChanged.addListener(handleStateChange);
}

async function init() {
    state = await loadState();
    renderNarrationButton();
    attachListeners();

    const file = new URLSearchParams(location.search).get('file');
    if (file) {
        await openUrl(file);
    } else {
        showEmptyPanel();
    }
}

init();
