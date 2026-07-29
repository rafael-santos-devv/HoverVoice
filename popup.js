// Estado da extensão
let extensionState = {
    enabled: false,
    voiceRate: 1,
    voicePitch: 1,
    voiceVolume: 1,
    language: 'pt-BR'
};

// Elementos do DOM
const extensionToggle = document.getElementById('extensionToggle');
const statusText = document.getElementById('statusText');
const statusSubtext = document.getElementById('statusSubtext');
const testInput = document.getElementById('testInput');
const testButton = document.getElementById('testButton');
const voiceRate = document.getElementById('voiceRate');
const voicePitch = document.getElementById('voicePitch');
const voiceVolume = document.getElementById('voiceVolume');
const rateValue = document.getElementById('rateValue');
const pitchValue = document.getElementById('pitchValue');
const volumeValue = document.getElementById('volumeValue');

// Carregar estado salvo
chrome.storage.local.get(['extensionState'], (result) => {
    if (result.extensionState) {
        extensionState = result.extensionState;
        updateUI();
    }
});

// Event Listeners
extensionToggle.addEventListener('change', toggleExtension);
testButton.addEventListener('click', testVoice);
voiceRate.addEventListener('input', updateVoiceSettings);
voicePitch.addEventListener('input', updateVoiceSettings);
voiceVolume.addEventListener('input', updateVoiceSettings);

// Alternar extensão
function toggleExtension() {
    extensionState.enabled = extensionToggle.checked;
    saveState();
    updateUI();
    notifyContentScript();
}

// Atualizar UI
function updateUI() {
    extensionToggle.checked = extensionState.enabled;
    
    if (extensionState.enabled) {
        statusText.textContent = 'HoverVoice Ativo';
        statusSubtext.textContent = 'Passe o mouse para ouvir';
    } else {
        statusText.textContent = 'HoverVoice Inativo';
        statusSubtext.textContent = 'Clique para ativar';
    }
    
    voiceRate.value = extensionState.voiceRate;
    voicePitch.value = extensionState.voicePitch;
    voiceVolume.value = extensionState.voiceVolume;
    
    rateValue.textContent = extensionState.voiceRate.toFixed(1) + 'x';
    pitchValue.textContent = extensionState.voicePitch.toFixed(1) + 'x';
    volumeValue.textContent = Math.round(extensionState.voiceVolume * 100) + '%';
}

// Atualizar configurações de voz
function updateVoiceSettings() {
    extensionState.voiceRate = parseFloat(voiceRate.value);
    extensionState.voicePitch = parseFloat(voicePitch.value);
    extensionState.voiceVolume = parseFloat(voiceVolume.value);
    
    rateValue.textContent = extensionState.voiceRate.toFixed(1) + 'x';
    pitchValue.textContent = extensionState.voicePitch.toFixed(1) + 'x';
    volumeValue.textContent = Math.round(extensionState.voiceVolume * 100) + '%';
    
    saveState();
}

// Testar voz
function testVoice() {
    const text = testInput.value.trim();
    
    if (!text) {
        alert('Digite um texto para testar');
        return;
    }
    
    speak(text);
}

// Função de síntese de voz
function speak(text) {
    // Cancelar qualquer fala anterior
    speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = extensionState.language;
    utterance.rate = extensionState.voiceRate;
    utterance.pitch = extensionState.voicePitch;
    utterance.volume = extensionState.voiceVolume;
    
    speechSynthesis.speak(utterance);
}

// Salvar estado
function saveState() {
    chrome.storage.local.set({ extensionState: extensionState });
}

// Notificar script de conteúdo
function notifyContentScript() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
                type: 'EXTENSION_STATE_CHANGED',
                payload: extensionState
            }).catch(() => {
                // Content script might not be loaded yet
            });
        }
    });
}

// Expor função de fala globalmente
window.speak = speak;
