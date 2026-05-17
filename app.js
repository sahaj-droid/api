import { ChatController } from './chat.js';
import { storage } from './storage.js';
import { autoResize, extractNumber, readTextFile, showToast } from './utils.js';
import { generateEquipmentPlan, printLastEquipmentPlan } from './planning.js';
import { formatProtocol, printProtocol } from './protocols.js';

const chat = new ChatController({
  messagesEl: document.getElementById('messages'),
  memoryEl: document.getElementById('chat-memory-list'),
  inputEl: document.getElementById('user-input')
});

window.openSettings = function openSettings() {
  document.getElementById('key-input').value = storage.getKey();
  document.getElementById('key-status').textContent = storage.getKey() ? 'Key saved' : '';
  document.getElementById('settings-overlay').style.display = 'block';
  document.getElementById('settings-modal').style.display = 'block';
};

function closeSettings() {
  document.getElementById('settings-overlay').style.display = 'none';
  document.getElementById('settings-modal').style.display = 'none';
}

function getPlanningInputs() {
  const value = id => (document.getElementById(id)?.value || '').trim();
  return {
    productName: value('plan-product-name'),
    productCode: value('plan-product-code'),
    batchSizeText: value('plan-batch-size'),
    batchSizeKg: extractNumber(value('plan-batch-size')) || 0,
    outputTargetKg: extractNumber(value('plan-output-target')) || 0,
    workingHoursPerDay: extractNumber(value('plan-shifts')) || 24,
    equipmentText: value('equipment-master-input') || storage.getEquipmentMaster(),
    processText: value('process-input')
  };
}

function initEvents() {
  document.getElementById('settings-open').addEventListener('click', window.openSettings);
  document.getElementById('settings-close').addEventListener('click', closeSettings);
  document.getElementById('settings-overlay').addEventListener('click', closeSettings);
  document.getElementById('save-key-btn').addEventListener('click', () => {
    const key = document.getElementById('key-input').value.trim();
    if (!key) return alert('Please enter your Gemini API key.');
    chat.setApiKey(key);
    document.getElementById('key-status').textContent = 'Key saved successfully';
    showToast('Key saved');
    setTimeout(closeSettings, 700);
  });

  document.querySelectorAll('.quick-chips button').forEach(btn => btn.addEventListener('click', () => sendPrompt(btn.dataset.prompt)));
  document.getElementById('send-btn').addEventListener('click', () => sendPrompt(document.getElementById('user-input').value));
  document.getElementById('user-input').addEventListener('input', e => autoResize(e.target));
  document.getElementById('user-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendPrompt(e.target.value);
    }
  });
  document.getElementById('clear-visible-chat').addEventListener('click', () => chat.clear());
  document.getElementById('clear-chat-btn').addEventListener('click', () => chat.clear());

  document.getElementById('equipment-file').addEventListener('change', async e => {
    await loadFileToTextarea(e, 'equipment-master-input');
    updateEquipmentMasterStatus();
  });
  document.getElementById('save-equipment-master-btn').addEventListener('click', saveEquipmentMaster);
  document.getElementById('load-equipment-master-btn').addEventListener('click', loadSavedEquipmentMaster);
  document.getElementById('clear-equipment-master-btn').addEventListener('click', clearSavedEquipmentMaster);
  document.getElementById('equipment-master-input').addEventListener('input', updateEquipmentMasterStatus);
  document.getElementById('process-file').addEventListener('change', e => loadFileToTextarea(e, 'process-input'));
  document.getElementById('protocol-file').addEventListener('change', e => loadFileToTextarea(e, 'protocol-input'));

  document.getElementById('map-plan-btn').addEventListener('click', () => {
    try {
      const data = getPlanningInputs();
      if (!data.productName || !data.productCode || !data.batchSizeText) throw new Error('Enter Product name, Product code and Batch size.');
      if (!data.equipmentText) throw new Error('Save or paste Equipment/Utility master first.');
      if (!data.processText) throw new Error('Paste/upload Process details.');
      generateEquipmentPlan(data, (role, html) => chat.addMessage(role, html));
    } catch (err) {
      alert(err.message);
    }
  });
  document.getElementById('print-plan-btn').addEventListener('click', printLastEquipmentPlan);
  document.addEventListener('click', e => {
    if (e.target?.id === 'inline-print-plan') printLastEquipmentPlan();
    if (e.target?.id === 'inline-print-protocol') printProtocol();
  });

  document.getElementById('format-protocol-btn').addEventListener('click', () => {
    try {
      const meta = getPlanningInputs();
      const html = formatProtocol(document.getElementById('protocol-input').value, meta);
      chat.addMessage('assistant', html);
    } catch (err) {
      alert(err.message);
    }
  });
  document.getElementById('print-protocol-btn').addEventListener('click', printProtocol);
}

async function loadFileToTextarea(event, textareaId) {
  const file = event.target.files?.[0];
  if (!file) return;
  document.getElementById(textareaId).value = await readTextFile(file);
}

function saveEquipmentMaster() {
  const textarea = document.getElementById('equipment-master-input');
  const text = textarea.value.trim();
  if (!text) {
    alert('Paste or upload equipment / utility master before saving.');
    return;
  }
  storage.setEquipmentMaster(text);
  updateEquipmentMasterStatus();
  showToast('Equipment master saved');
}

function loadSavedEquipmentMaster() {
  const saved = storage.getEquipmentMaster();
  if (!saved) {
    alert('No saved equipment master found.');
    return;
  }
  document.getElementById('equipment-master-input').value = saved;
  updateEquipmentMasterStatus();
  showToast('Saved equipment master loaded');
}

function clearSavedEquipmentMaster() {
  if (!confirm('Clear saved Equipment/Utility master from this browser?')) return;
  storage.clearEquipmentMaster();
  document.getElementById('equipment-master-input').value = '';
  updateEquipmentMasterStatus();
  showToast('Equipment master cleared');
}

function updateEquipmentMasterStatus() {
  const status = document.getElementById('equipment-master-status');
  const current = document.getElementById('equipment-master-input').value.trim();
  const saved = storage.getEquipmentMaster();
  if (!status) return;
  if (saved && current && current === saved) {
    status.textContent = 'Saved equipment master loaded. Mapping will use this master automatically.';
  } else if (saved && current && current !== saved) {
    status.textContent = 'Saved master exists. Current textarea has unsaved changes.';
  } else if (saved) {
    status.textContent = 'Saved equipment master available. Mapping can use it even if textarea is empty.';
  } else if (current) {
    status.textContent = 'Equipment master entered but not saved yet.';
  } else {
    status.textContent = 'No saved equipment master yet.';
  }
}

async function sendPrompt(text) {
  const input = document.getElementById('user-input');
  const prompt = String(text || '').trim();
  if (!prompt) return;
  input.value = '';
  input.style.height = 'auto';
  try {
    await chat.send(prompt);
  } catch (err) {
    chat.addMessage('assistant', '<strong>Connection error:</strong> ' + err.message);
  }
}

chat.init();
initEvents();
loadSavedEquipmentMasterOnStart();
if (!storage.getKey()) setTimeout(window.openSettings, 500);

function loadSavedEquipmentMasterOnStart() {
  const saved = storage.getEquipmentMaster();
  if (saved) document.getElementById('equipment-master-input').value = saved;
  updateEquipmentMasterStatus();
}
