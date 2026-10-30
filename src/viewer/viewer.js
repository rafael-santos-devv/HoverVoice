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

import * as pdfjsLib from '../../lib/pdf.min.mjs';
import { buildBlocks } from './pdf-blocks.js';

// =========================================================================
// Constantes
// =========================================================================

// HoverVoice (src/shared/state.js) é carregado por <script> comum antes deste módulo.
const {
    DEFAULT_STATE, RATE_RANGE, PITCH_RANGE, VOLUME_RANGE,
    clamp, readState, writeState, stateFromChange
} = HoverVoice;
const t = HoverVoiceI18n.t;

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
        window.speechSynthesis.speak(HoverVoiceVoice.createUtterance(text, state));
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
        title: t('viewer.emptyTitle'),
        text: t('viewer.emptyText')
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
            title: t('viewer.passwordTitle'),
            text: t(wasIncorrect ? 'viewer.passwordWrong' : 'viewer.passwordAsk'),
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
    constructor(titleKey, textKey, { canOpenNative = false, params = {} } = {}) {
        super(textKey);
        this.title = t(titleKey);
        this.text = t(textKey, params);
        this.canOpenNative = canOpenNative;
    }
}

/** Confirma que os bytes são de um PDF (e não, por exemplo, uma página de login). */
function assertIsPdf(buffer) {
    const head = new TextDecoder('latin1').decode(buffer.slice(0, 1024));
    if (!head.includes('%PDF-')) {
        throw new LoadError(
            'viewer.notPdfTitle',
            'viewer.notPdfUrl',
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
                'viewer.localTitle',
                'viewer.localText'
            );
        }
        throw new LoadError(
            'viewer.downloadFailTitle',
            'viewer.downloadFailText',
            { canOpenNative: true }
        );
    }

    if (!response.ok) {
        throw new LoadError(
            'viewer.downloadFailTitle',
            'viewer.serverError',
            { canOpenNative: true, params: { status: response.status } }
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

/**
 * Inicia o carregamento no PDF.js e trata a senha. O objeto devolvido expõe
 * `wasCancelled()` para distinguir "pessoa desistiu da senha" de erro real.
 */
function startLoading(bytes) {
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

    return { promise: loadingTask.promise, wasCancelled: () => cancelledByUser };
}

/** Lê tamanho da página 1 e título, e atualiza o cabeçalho da janela. */
async function readDocumentInfo() {
    const firstPage = await pdf.getPage(1);
    const firstViewport = firstPage.getViewport({ scale: 1 });
    baseSize = { width: firstViewport.width, height: firstViewport.height };
    firstPage.cleanup();

    const meta = await pdf.getMetadata().catch(() => null);
    const title = pickTitle(meta?.info?.Title, pdfName);
    // O idioma declarado no PDF guia a voz no modo automático (o content.js lê o lang mais próximo).
    ui.documento.lang = meta?.info?.Language || '';
    ui.titulo.textContent = title;
    ui.titulo.title = title;
    document.title = `${title} — HoverVoice`;
    return title;
}

function announceOpened(title) {
    const count = pdf.numPages;
    const pagesLabel = count === 1 ? t('viewer.pagesOne') : t('viewer.pagesMany', { count });
    const hint = state.enabled ? '' : t('viewer.narrationHint');
    announce(t('viewer.opened', { title, pages: pagesLabel, hint }));
}

async function openDocument(bytes, name, origin) {
    const currentLoad = ++loadId;

    disposeDocument();
    setControlsEnabled(false);
    hideMessage();
    showPanel({ title: t('viewer.openingTitle'), text: t('viewer.fewMoments'), showPicker: false });

    pdfName = /\.pdf$/i.test(name) ? name : `${name}.pdf`;
    sourceUrl = origin;
    // O PDF.js assume a posse do buffer; por isso o Blob é criado antes.
    pdfBlob = new Blob([bytes], { type: 'application/pdf' });

    const loading = startLoading(bytes);

    let doc;
    try {
        doc = await loading.promise;
    } catch (error) {
        if (currentLoad !== loadId) return;
        if (loading.wasCancelled()) {
            showEmptyPanel();
            return;
        }
        console.error('[HoverVoice] Falha ao abrir o PDF:', error);
        showErrorPanel(
            t('viewer.openFailTitle'),
            t('viewer.openFailText'),
            { canOpenNative: true }
        );
        return;
    }

    if (currentLoad !== loadId) {
        doc.destroy().catch(() => {});
        return;
    }

    pdf = doc;
    const title = await readDocumentInfo();

    scale = loadSavedZoom() ?? fitWidthScale();
    buildPages();
    setControlsEnabled(true);
    showDocument();
    startObserving();
    announceOpened(title);
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

/** Cria o canvas da página e inicia o desenho; devolve também o tamanho em pixels CSS. */
function createPageCanvas(page) {
    const cssViewport = page.getViewport({ scale });
    const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    const renderViewport = page.getViewport({ scale: scale * pixelRatio });

    const cssWidth = `${Math.floor(cssViewport.width)}px`;
    const cssHeight = `${Math.floor(cssViewport.height)}px`;

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(renderViewport.width);
    canvas.height = Math.floor(renderViewport.height);
    canvas.style.width = cssWidth;
    canvas.style.height = cssHeight;
    canvas.setAttribute('aria-hidden', 'true');

    const task = page.render({ canvas, viewport: renderViewport });
    return { canvas, task, cssViewport, cssWidth, cssHeight };
}

function showPageError(entry) {
    const message = document.createElement('p');
    message.className = 'pagina-erro';
    message.textContent = t('viewer.pageFail');
    entry.el.replaceChildren(message);
}

async function renderPage(entry) {
    if (!entry || !pdf || entry.status !== 'idle') return;

    entry.status = 'rendering';
    const token = ++entry.token;

    try {
        const page = await pdf.getPage(entry.number);
        if (token !== entry.token) return;

        const { canvas, task, cssViewport, cssWidth, cssHeight } = createPageCanvas(page);
        entry.el.style.width = cssWidth;
        entry.el.style.height = cssHeight;
        entry.renderTask = task;

        const [textContent] = await Promise.all([page.getTextContent(), task.promise]);
        if (token !== entry.token) return;

        const blocks = buildBlocks(textContent.items, cssViewport);
        const layer = document.createDocumentFragment();
        blocks.forEach((block) => layer.appendChild(createBlock(block, entry.number)));

        entry.el.replaceChildren(canvas, layer);
        entry.status = 'done';
        entry.renderTask = null;
        page.cleanup();

        evictDistantPages(entry.number);

        if (entry.number === 1 && blocks.length === 0) {
            showMessage(
                t('viewer.noText'),
                'aviso'
            );
        }
    } catch (error) {
        if (error?.name === 'RenderingCancelledException' || token !== entry.token) return;

        console.error(`[HoverVoice] Falha ao exibir a página ${entry.number}:`, error);
        entry.status = 'error';
        showPageError(entry);
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
        showErrorPanel(t('viewer.notPdfTitle'), t('viewer.notPdfFile', { name: file.name }));
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
    showPanel({ title: t('viewer.downloadingTitle'), text: t('viewer.fewMoments'), showPicker: false });
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
        showErrorPanel(error.title, error.text, { canOpenNative: error.canOpenNative });
        return;
    }
    console.error('[HoverVoice] Erro inesperado:', error);
    showErrorPanel(t('viewer.genericTitle'), t('viewer.genericText'), { canOpenNative: true });
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

function renderNarrationButton() {
    ui.narracao.setAttribute('aria-pressed', String(state.enabled));
    ui.narracaoTexto.textContent = t(state.enabled ? 'viewer.narrationOn' : 'viewer.narrationOff');
    document.body.dataset.narracao = state.enabled ? 'ligada' : 'desligada';
}

async function toggleNarration() {
    try {
        await writeState({ ...state, enabled: !state.enabled });
    } catch (error) {
        console.error('[HoverVoice] Falha ao gravar o estado:', error);
        showMessage(t('viewer.toggleFail'), 'erro');
    }
}

function handleStateChange(changes, areaName) {
    const newState = stateFromChange(changes, areaName);
    if (!newState) return;
    state = newState;
    renderLanguage();
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

/** Aplica o idioma da interface; o conteúdo dinâmico (painel, mensagens) segue o idioma de quando foi criado. */
function renderLanguage() {
    HoverVoiceI18n.setFromState(state);
    HoverVoiceI18n.apply();
    renderNarrationButton();
    if (!pdf) ui.titulo.textContent = t('viewer.noFile');
}

async function init() {
    state = await readState();
    renderLanguage();
    attachListeners();

    const file = new URLSearchParams(location.search).get('file');
    if (file) {
        await openUrl(file);
    } else {
        showEmptyPanel();
    }
}

init();
