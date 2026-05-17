import { escapeHtml, renderMarkdown } from './utils.js';
import { openPrintableReport, signatureTable, table } from './reports.js';

let lastProtocolHtml = '';

export function formatProtocol(rawText, meta = {}) {
  let text = String(rawText || '').trim();
  if (!text) throw new Error('Paste or upload a Process Validation Protocol first.');
  
  // Substitute placeholders with new product details
  if (meta.productName) text = text.replace(/\{\{PRODUCT_NAME\}\}/g, meta.productName);
  if (meta.productCode) text = text.replace(/\{\{PRODUCT_CODE\}\}/g, meta.productCode);
  if (meta.batchSizeText) text = text.replace(/\{\{BATCH_SIZE\}\}/g, meta.batchSizeText);

  // Substitute dynamic user-defined variables
  if (meta.dynamicVars) {
    for (const [key, val] of Object.entries(meta.dynamicVars)) {
       if (val) text = text.split(`{{${key}}}`).join(val);
    }
  }

  const sections = extractProtocolSections(text);
  lastProtocolHtml = buildProtocolHtml(sections, meta, text);
  return '<h3>Editable Process Validation Protocol</h3>' + lastProtocolHtml + '<button class="mini-action" id="inline-print-protocol">Print / Save PV PDF</button>';
}

export function printProtocol() {
  if (!lastProtocolHtml) {
    const raw = document.getElementById('protocol-input')?.value || '';
    lastProtocolHtml = buildProtocolHtml(extractProtocolSections(raw), {}, raw);
  }
  openPrintableReport('<div class="report-shell"><div class="report-actions"><button onclick="window.print()">Print / Save as PDF</button><button onclick="window.close()">Close</button></div>' + lastProtocolHtml + '<h2>Approval</h2>' + signatureTable() + '</div>', 'Process Validation Protocol');
}

function extractProtocolSections(text) {
  const known = ['objective', 'scope', 'responsibilities', 'validation strategy', 'process description', 'critical process parameters', 'critical quality attributes', 'sampling plan', 'acceptance criteria', 'deviation', 'change control', 'approval'];
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const sections = [];
  let current = { title: 'Protocol Text', body: [] };
  for (const line of lines) {
    const normalized = line.toLowerCase().replace(/^\d+(\.\d+)*\s*/, '').replace(/:$/, '');
    const isHeading = known.some(k => normalized.includes(k)) || (/^\d+(\.\d+)*\s+/.test(line) && line.length < 90);
    if (isHeading && current.body.length) {
      sections.push(current);
      current = { title: line.replace(/:$/, ''), body: [] };
    } else if (isHeading) {
      current.title = line.replace(/:$/, '');
    } else {
      current.body.push(line);
    }
  }
  if (current.body.length || current.title !== 'Protocol Text') sections.push(current);
  return sections.length ? sections : [{ title: 'Protocol Text', body: [text] }];
}

function buildProtocolHtml(sections, meta, originalText) {
  const title = meta.productName ? 'Process Validation Protocol - ' + meta.productName : 'Process Validation Protocol';
  const rows = [['Product Name', meta.productName || 'To be completed'], ['Product Code', meta.productCode || 'To be completed'], ['Batch Size', meta.batchSize || meta.batchSizeText || 'To be completed'], ['Document Status', 'Editable draft for QA/Production review']];
  return '<h1>' + escapeHtml(title) + '</h1>' +
    table(['Field','Detail'], rows) +
    '<h2>Protocol Sections</h2>' +
    sections.map(section => '<h2>' + escapeHtml(section.title) + '</h2><div contenteditable="true">' + renderMarkdown(section.body.join('\n')) + '</div>').join('') +
    '<h2>Standard Review Checklist</h2>' +
    table(['Area','Check Point'], [
      ['Batch selection','Validation batches, scale and campaign basis are clearly defined'],
      ['CPP/CQA linkage','Critical process parameters and quality attributes are identified'],
      ['Sampling','Sampling points, sample quantity and responsible function are defined'],
      ['Acceptance criteria','Objective, measurable and aligned with approved specifications'],
      ['Deviations','Deviation/OOS/OOT handling and impact assessment are defined'],
      ['Approval','Prepared, checked and approved by responsible departments']
    ]);
}
