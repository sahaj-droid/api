import { ChatController } from './chat.js';
import { storage } from './storage.js';
import { autoResize, extractNumber, readTextFile, showToast } from './utils.js';
import { generateEquipmentPlan, printLastEquipmentPlan } from './planning.js';
import { formatProtocol, printProtocol } from './protocols.js';
import { artifactPanel } from './artifact.js';

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
  const data = {
    productName: value('plan-product-name'),
    productCode: value('plan-product-code'),
    batchSizeText: value('plan-batch-size'),
    batchSizeKg: extractNumber(value('plan-batch-size')) || 0,
    outputTargetKg: extractNumber(value('plan-output-target')) || 0,
    workingHoursPerDay: extractNumber(value('plan-shifts')) || 24,
    equipmentText: value('equipment-master-input') || storage.getEquipmentMaster(),
    processText: value('process-input'),
    dynamicVars: {}
  };
  
  const dynInputs = document.querySelectorAll('#dynamic-vars-list input');
  dynInputs.forEach(input => {
    const key = input.id.replace('dyn-var-', '');
    data.dynamicVars[key] = input.value.trim();
  });
  
  return data;
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
  document.getElementById('protocol-file').addEventListener('change', e => loadFileToTextarea(e, 'protocol-input', 'PV Protocol'));

  document.getElementById('map-plan-btn').addEventListener('click', () => {
    try {
      const data = getPlanningInputs();
      if (!data.productName || !data.productCode || !data.batchSizeText) throw new Error('Enter Product name, Product code and Batch size.');
      if (!data.equipmentText) throw new Error('Save or paste Equipment/Utility master first.');
      if (!data.processText) throw new Error('Paste/upload Process details.');
      
      // Let planning.js generate the HTML. But we capture it and put it in Artifact panel.
      // Modifying generateEquipmentPlan to just return the HTML and data, but for now we can pass a callback that opens artifact
      generateEquipmentPlan(data, (role, html) => {
        chat.addMessage('assistant', 'Equipment Mapping and Production Plan generated. Opening in Artifact Panel...');
        artifactPanel.open(html, 'Equipment Plan - ' + data.productName);
      });
    } catch (err) {
      alert(err.message);
    }
  });
  document.addEventListener('click', e => {
    if (e.target?.id === 'inline-print-plan') printLastEquipmentPlan();
    if (e.target?.id === 'inline-print-protocol') printProtocol();
  });

  document.getElementById('save-pv-template-btn').addEventListener('click', savePvTemplate);
  document.getElementById('load-pv-template-btn').addEventListener('click', loadSavedPvTemplate);
  document.getElementById('clear-pv-template-btn').addEventListener('click', clearSavedPvTemplate);
  document.getElementById('protocol-input').addEventListener('input', updatePvTemplateStatus);

  document.getElementById('format-protocol-btn').addEventListener('click', () => {
    try {
      const meta = getPlanningInputs();
      const rawText = document.getElementById('protocol-input').value || storage.getPvTemplate();
      if (!rawText) throw new Error('No Process Validation Protocol text found. Please upload a template or load the default one.');
      
      const html = formatProtocol(rawText, meta);
      chat.addMessage('assistant', 'Process Validation Protocol formatted. Opening in Artifact Panel...');
      artifactPanel.open(html, 'PV Protocol' + (meta.productName ? ' - ' + meta.productName : ''));
    } catch (err) {
      alert(err.message);
    }
  });
}

async function loadFileToTextarea(event, textareaId, docType = 'File') {
  const file = event.target.files?.[0];
  if (!file) return;
  chat.addMessage('user', `Uploaded ${file.name}`);
  chat.addMessage('assistant', `Parsing ${file.name}... Please wait.`);
  try {
    const text = await readTextFile(file);
    document.getElementById(textareaId).value = text;
    
    // Auto-extract metadata if it's a process or protocol file
    if (docType === 'PV Protocol' || textareaId === 'process-input') {
      const extractedCount = extractMetadataFromText(text);
      if (extractedCount > 0) {
        chat.addMessage('assistant', `Successfully extracted ${text.length} characters from ${file.name}. \n\n**Auto-detected ${extractedCount} product details** and filled them in the 'Product Details' section!`);
      } else {
        chat.addMessage('assistant', `Successfully extracted ${text.length} characters from ${file.name}. You can now review it in the side panel and generate the ${docType}.`);
      }
      
      // Auto-open Product Details accordion to show what was filled
      document.querySelector('details.accordion').open = true;
    } else {
      chat.addMessage('assistant', `Successfully extracted ${text.length} characters from ${file.name}. You can now review it in the side panel and generate the ${docType}.`);
    }
  } catch(e) {
    chat.addMessage('assistant', `**Error parsing ${file.name}:** ` + e.message);
  }
}

function extractMetadataFromText(text) {
  let count = 0;
  // Product Name
  const nameMatch = text.match(/(?:Product Name|Product|Name of Product|Name)\s*[:\-]?\s*([A-Za-z0-9\-\s\(\)]+?)(?=\n|\r|\||(?:\s{3,}))/i);
  if (nameMatch && nameMatch[1]) {
    const el = document.getElementById('plan-product-name');
    if (!el.value) { el.value = nameMatch[1].trim(); count++; }
  }
  
  // Product Code
  const codeMatch = text.match(/(?:Product Code|Item Code|Code|Material Code)\s*[:\-]?\s*([A-Za-z0-9\-]+)/i);
  if (codeMatch && codeMatch[1]) {
    const el = document.getElementById('plan-product-code');
    if (!el.value) { el.value = codeMatch[1].trim(); count++; }
  }
  
  // Batch Size
  const batchMatch = text.match(/(?:Batch Size|B\.S\.|Std\. Batch Size|Batch Quantity)\s*[:\-]?\s*([\d\.,]+\s*(?:kg|g|mg|l|ml|kl|pcs|nos))/i);
  if (batchMatch && batchMatch[1]) {
    const el = document.getElementById('plan-batch-size');
    if (!el.value) { el.value = batchMatch[1].trim(); count++; }
  }
  
  return count;
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

// PV Template Functions
function savePvTemplate() {
  const textarea = document.getElementById('protocol-input');
  let text = textarea.value.trim();
  if (!text) {
    alert('Paste or upload a Process Validation Protocol before saving.');
    return;
  }
  
  // Auto-parameterize the template by replacing the detected product details with placeholders
  const nameMatch = text.match(/(?:Product Name|Product|Name of Product|Name)\s*[:\-]?\s*([A-Za-z0-9\-\s\(\)]+?)(?=\n|\r|\||(?:\s{3,}))/i);
  if (nameMatch && nameMatch[1]) {
    const oldName = nameMatch[1].trim();
    if (oldName.length > 3) text = text.split(oldName).join('{{PRODUCT_NAME}}');
  }

  const codeMatch = text.match(/(?:Product Code|Item Code|Code|Material Code)\s*[:\-]?\s*([A-Za-z0-9\-]+)/i);
  if (codeMatch && codeMatch[1]) {
    const oldCode = codeMatch[1].trim();
    if (oldCode.length > 2) text = text.split(oldCode).join('{{PRODUCT_CODE}}');
  }

  const batchMatch = text.match(/(?:Batch Size|B\.S\.|Std\. Batch Size|Batch Quantity)\s*[:\-]?\s*([\d\.,]+\s*(?:kg|g|mg|l|ml|kl|pcs|nos))/i);
  if (batchMatch && batchMatch[1]) {
    const oldBatch = batchMatch[1].trim();
    if (oldBatch.length > 1) text = text.split(oldBatch).join('{{BATCH_SIZE}}');
  }

  storage.setPvTemplate(text);
  updatePvTemplateStatus();
  showToast('Default PV Template saved with auto-placeholders');
}

function loadSavedPvTemplate() {
  const saved = storage.getPvTemplate();
  if (!saved) {
    alert('No default PV template found. Upload your template once and click "Save as Default".');
    return;
  }
  document.getElementById('protocol-input').value = saved;
  updatePvTemplateStatus();
  showToast('Default PV Template loaded');
}

function clearSavedPvTemplate() {
  if (!confirm('Clear the default PV Template from this browser?')) return;
  storage.clearPvTemplate();
  document.getElementById('protocol-input').value = '';
  updatePvTemplateStatus();
  showToast('Default PV Template cleared');
}

function updatePvTemplateStatus() {
  const status = document.getElementById('pv-template-status');
  const current = document.getElementById('protocol-input').value.trim();
  const saved = storage.getPvTemplate();
  
  updateDynamicVariablesUI(current || saved);
  
  if (!status) return;
  if (saved && current && current === saved) {
    status.textContent = 'Default template loaded. Ready to generate.';
  } else if (saved && current && current !== saved) {
    status.textContent = 'Default template exists, but textarea has different/unsaved text.';
  } else if (saved) {
    status.textContent = 'Default template available in background. You can generate directly.';
  } else if (current) {
    status.textContent = 'Template entered but not saved as default yet.';
  } else {
    status.textContent = 'No default template saved. Upload once to set it.';
  }
}

function updateDynamicVariablesUI(text) {
  const container = document.getElementById('dynamic-vars-container');
  const list = document.getElementById('dynamic-vars-list');
  if (!text || !container || !list) return;
  
  const regex = /\{\{([A-Z0-9_ %.]+)\}\}/g;
  const matches = [...text.matchAll(regex)].map(m => m[1]);
  const uniqueVars = [...new Set(matches)];
  
  const standardVars = ['PRODUCT_NAME', 'PRODUCT_CODE', 'BATCH_SIZE'];
  const dynamicVars = uniqueVars.filter(v => !standardVars.includes(v));
  
  if (dynamicVars.length === 0) {
    container.style.display = 'none';
    list.innerHTML = '';
    return;
  }
  
  container.style.display = 'block';
  list.innerHTML = '';
  
  const savedVars = storage.getDynamicVars();
  
  dynamicVars.forEach(v => {
    const input = document.createElement('input');
    input.className = 'panel-input';
    input.id = 'dyn-var-' + v;
    input.placeholder = v.replace(/_/g, ' ');
    if (savedVars[v]) input.value = savedVars[v];
    
    input.addEventListener('input', (e) => {
      storage.setDynamicVar(v, e.target.value);
    });
    
    list.appendChild(input);
  });
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

async function startApp() {
  await storage.init();
  chat.init();
  initEvents();
  loadSavedEquipmentMasterOnStart();
  if (!storage.getKey()) setTimeout(window.openSettings, 500);
}

startApp();

function loadSavedEquipmentMasterOnStart() {
  const savedEq = storage.getEquipmentMaster();
  if (savedEq) document.getElementById('equipment-master-input').value = savedEq;
  updateEquipmentMasterStatus();
  
  const savedPv = storage.getPvTemplate();
  if (savedPv) document.getElementById('protocol-input').value = savedPv;
  updatePvTemplateStatus();
}
