/**
 * HoverVoice — Agrupamento de texto de PDF em blocos narráveis
 * ---------------------------------------------------------------------
 * O PDF.js entrega o texto em fragmentos minúsculos (às vezes uma palavra,
 * às vezes meia linha). Narrar cada fragmento resultaria em uma fala
 * picotada. Este módulo reúne os fragmentos em LINHAS e, em seguida, as
 * linhas em BLOCOS (parágrafos ou trechos de parágrafo), calculando o
 * retângulo que cada bloco ocupa na página — é sobre esse retângulo que o
 * leitor posiciona o elemento que recebe o mouse e o foco.
 *
 * É um módulo puro (sem DOM): recebe dados e devolve dados. Isso permite
 * testá-lo fora do navegador.
 */

/** Limite de caracteres por bloco. Deve ficar abaixo do MAX_TEXT_LENGTH (500) do content.js. */
export const MAX_BLOCK_CHARS = 480;

const SENTENCE_END = /[.!?…:;]["')\]»”’]*$/;
const HYPHEN_END = /[A-Za-zÀ-ÖØ-öø-ÿ]-$/;
const LOWERCASE_START = /^[a-zà-öø-ÿ]/;

// ---------------------------------------------------------------------
// Geometria
// ---------------------------------------------------------------------

/** Multiplica duas matrizes de transformação 2D no formato [a, b, c, d, e, f]. */
function multiply(m1, m2) {
    return [
        m1[0] * m2[0] + m1[2] * m2[1],
        m1[1] * m2[0] + m1[3] * m2[1],
        m1[0] * m2[2] + m1[2] * m2[3],
        m1[1] * m2[2] + m1[3] * m2[3],
        m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
        m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
    ];
}

/**
 * Converte um fragmento do PDF.js em um retângulo no espaço da tela
 * (pixels CSS, origem no canto superior esquerdo da página).
 * Devolve null para texto que não corre na horizontal (ex.: marca d'água
 * girada), que não é narrado por este leitor.
 */
function toScreenItem(item, viewport) {
    const m = multiply(viewport.transform, item.transform);

    // Direção do texto na tela: só aceita texto horizontal, da esquerda para a direita.
    const horizontal = m[0] > 0 && Math.abs(m[1]) < Math.abs(m[0]) * 0.2;
    if (!horizontal) return null;

    const fontHeight = Math.hypot(m[2], m[3]);
    if (!(fontHeight > 0)) return null;

    const left = m[4];
    const baseline = m[5];
    const width = item.width * viewport.scale;

    return {
        str: item.str,
        hasEOL: Boolean(item.hasEOL),
        left,
        right: left + width,
        baseline,
        fontHeight,
        top: baseline - fontHeight * 0.95,
        bottom: baseline + fontHeight * 0.25
    };
}

// ---------------------------------------------------------------------
// Fragmentos → linhas
// ---------------------------------------------------------------------

function newLine(first) {
    return {
        parts: [first],
        left: first.left,
        right: first.right,
        top: first.top,
        bottom: first.bottom,
        baseline: first.baseline,
        fontHeight: first.fontHeight
    };
}

/** Une os fragmentos de uma linha, inserindo espaço onde há folga visível. */
function lineText(line) {
    let text = '';
    let previous = null;

    for (const part of line.parts) {
        if (previous) {
            const gap = part.left - previous.right;
            const needsSpace = gap > line.fontHeight * 0.15
                && !/\s$/.test(text)
                && !/^\s/.test(part.str);
            if (needsSpace) text += ' ';
        }
        text += part.str;
        previous = part;
    }

    return text.replace(/\s+/g, ' ').trim();
}

function groupIntoLines(items) {
    const lines = [];
    let current = null;
    let forceBreak = false;

    for (const item of items) {
        const startsNewLine = !current
            || forceBreak
            || Math.abs(item.baseline - current.baseline) > Math.max(item.fontHeight, current.fontHeight) * 0.5
            // Voltou muito para a esquerda na mesma altura: outra coluna.
            || item.left < current.right - item.fontHeight * 3;

        if (startsNewLine) {
            current = newLine(item);
            lines.push(current);
        } else {
            current.parts.push(item);
            current.left = Math.min(current.left, item.left);
            current.right = Math.max(current.right, item.right);
            current.top = Math.min(current.top, item.top);
            current.bottom = Math.max(current.bottom, item.bottom);
            current.fontHeight = Math.max(current.fontHeight, item.fontHeight);
        }

        forceBreak = item.hasEOL;
    }

    return lines
        .map((line) => ({ ...line, text: lineText(line) }))
        .filter((line) => line.text.length > 0);
}

// ---------------------------------------------------------------------
// Linhas → blocos
// ---------------------------------------------------------------------

function median(values) {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
}

/** Espaçamento típico entre linhas consecutivas da página (linha de base a linha de base). */
function typicalLineAdvance(lines) {
    const advances = [];
    for (let i = 1; i < lines.length; i += 1) {
        const previous = lines[i - 1];
        const line = lines[i];
        const advance = line.baseline - previous.baseline;
        const sameSize = Math.abs(line.fontHeight - previous.fontHeight) < previous.fontHeight * 0.15;
        if (advance > 0 && advance < previous.fontHeight * 3 && sameSize) {
            advances.push(advance);
        }
    }
    return median(advances);
}

/** Borda direita da coluna a que a linha pertence (usada para detectar fim de parágrafo). */
function columnRight(line, lines) {
    let right = line.right;
    for (const other of lines) {
        if (Math.abs(other.left - line.left) < line.fontHeight * 5) {
            right = Math.max(right, other.right);
        }
    }
    return right;
}

/** Decide se `line` inicia um novo bloco em relação à linha anterior. */
function startsNewBlock(previous, line, advanceLimit, lines) {
    const advance = line.baseline - previous.baseline;
    const fontHeight = Math.max(previous.fontHeight, line.fontHeight);

    // Subiu na página: mudou de coluna ou de região.
    if (advance <= 0) return true;

    // Espaço extra entre linhas: separação de parágrafo.
    if (advance > advanceLimit) return true;

    // Mudança de tamanho de fonte: título, legenda, nota de rodapé.
    if (Math.abs(line.fontHeight - previous.fontHeight) > fontHeight * 0.2) return true;

    // Deslocamento horizontal grande: outra coluna ou célula de tabela.
    if (Math.abs(line.left - previous.left) > fontHeight * 12) return true;

    // Linha anterior terminou uma frase antes da borda da coluna: fim de parágrafo.
    if (SENTENCE_END.test(previous.text)
        && previous.right < columnRight(previous, lines) - fontHeight * 4) {
        return true;
    }

    return false;
}

/** Junta o texto de duas linhas, refazendo palavras hifenizadas na quebra de linha. */
function joinLines(text, next) {
    if (HYPHEN_END.test(text) && LOWERCASE_START.test(next)) {
        return text.slice(0, -1) + next;
    }
    return `${text} ${next}`;
}

function closeBlock(lines) {
    let text = lines[0].text;
    for (let i = 1; i < lines.length; i += 1) {
        text = joinLines(text, lines[i].text);
    }

    return {
        text,
        left: Math.min(...lines.map((l) => l.left)),
        top: Math.min(...lines.map((l) => l.top)),
        right: Math.max(...lines.map((l) => l.right)),
        bottom: Math.max(...lines.map((l) => l.bottom))
    };
}

/**
 * Divide um parágrafo longo em trechos de tamanho parecido, cortando sempre
 * no fim de uma linha e, quando possível, no fim de uma frase. Cortar de
 * forma equilibrada evita sobras de uma ou duas palavras no fim do parágrafo.
 */
function splitLongParagraph(lines) {
    const lengthOf = (list) => list.reduce((sum, l) => sum + l.text.length + 1, 0);
    const total = lengthOf(lines);
    if (total <= MAX_BLOCK_CHARS) return [lines];

    const parts = Math.ceil(total / (MAX_BLOCK_CHARS * 0.8));
    const target = total / parts;

    const chunks = [];
    let current = [];
    let length = 0;

    lines.forEach((line, index) => {
        const lineLength = line.text.length + 1;

        // Estouraria o limite: fecha o trecho antes desta linha.
        if (current.length > 0 && length + lineLength > MAX_BLOCK_CHARS) {
            chunks.push(current);
            current = [];
            length = 0;
        }

        current.push(line);
        length += lineLength;

        const isLast = index === lines.length - 1;
        const reachedTarget = length >= target;
        const sentenceEnd = length >= target * 0.7 && SENTENCE_END.test(line.text);

        if (!isLast && (reachedTarget || sentenceEnd)) {
            chunks.push(current);
            current = [];
            length = 0;
        }
    });

    if (current.length > 0) chunks.push(current);
    return chunks;
}

function groupIntoBlocks(lines) {
    if (lines.length === 0) return [];

    const typical = typicalLineAdvance(lines);
    const advanceLimit = typical
        ? typical * 1.3
        : Math.max(...lines.map((l) => l.fontHeight)) * 1.6;

    // Etapa 1: parágrafos, separados por quebras naturais do layout.
    const paragraphs = [];
    let group = [lines[0]];

    for (let i = 1; i < lines.length; i += 1) {
        if (startsNewBlock(lines[i - 1], lines[i], advanceLimit, lines)) {
            paragraphs.push(group);
            group = [];
        }
        group.push(lines[i]);
    }
    paragraphs.push(group);

    // Etapa 2: parágrafos longos viram vários blocos equilibrados.
    return paragraphs
        .flatMap(splitLongParagraph)
        .map(closeBlock);
}

// ---------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------

/**
 * Converte o conteúdo textual de uma página em blocos narráveis.
 *
 * @param {Array} items     `items` devolvidos por `page.getTextContent()`.
 * @param {object} viewport Viewport do PDF.js usado para exibir a página (em pixels CSS).
 * @returns {Array<{text:string,left:number,top:number,width:number,height:number}>}
 */
export function buildBlocks(items, viewport) {
    const screenItems = [];

    for (const item of items) {
        // Itens de marcação estrutural não têm `str`.
        if (typeof item.str !== 'string') continue;
        const converted = toScreenItem(item, viewport);
        if (converted) screenItems.push(converted);
    }

    const padding = 2;

    return groupIntoBlocks(groupIntoLines(screenItems))
        .map((block) => {
            const left = Math.max(0, block.left - padding);
            const top = Math.max(0, block.top - padding);
            const right = Math.min(viewport.width, block.right + padding);
            const bottom = Math.min(viewport.height, block.bottom + padding);
            return {
                text: block.text,
                left,
                top,
                width: Math.max(0, right - left),
                height: Math.max(0, bottom - top)
            };
        })
        .filter((block) => block.text && block.width > 0 && block.height > 0);
}
