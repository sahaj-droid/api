import { escapeHtml } from './utils.js';

export function table(headers, rows) {
  return '<table><thead><tr>' + headers.map(h => '<th>' + escapeHtml(h) + '</th>').join('') + '</tr></thead><tbody>' +
    rows.map(row => '<tr>' + row.map(cell => '<td>' + escapeHtml(cell) + '</td>').join('') + '</tr>').join('') +
    '</tbody></table>';
}

export function signatureTable() {
  return table(['Role', 'Name / Signature', 'Date'], [
    ['Prepared by', '', ''],
    ['Checked by', '', ''],
    ['Production Head', '', ''],
    ['QC Head', '', ''],
    ['QA Approval', '', '']
  ]);
}

export function openPrintableReport(reportHtml, title) {
  const reportWindow = window.open('', '_blank');
  if (!reportWindow) {
    alert('Popup blocked. Please allow popups to generate the PDF-ready report.');
    return;
  }
  const styles = [...document.querySelectorAll('link[rel="stylesheet"], style')]
    .map(node => node.tagName === 'LINK' ? '<link rel="stylesheet" href="' + node.href + '">' : '<style>' + node.innerHTML + '</style>')
    .join('');
  reportWindow.document.write('<!DOCTYPE html><html><head><title>' + escapeHtml(title) + '</title>' + styles + '</head><body>' + reportHtml + '</body></html>');
  reportWindow.document.close();
  reportWindow.focus();
}

export function buildCleaningValidationReport(data) {
  const today = new Date().toLocaleDateString();
  return '<div class="report-shell">' +
    '<div class="report-actions"><button onclick="window.print()">Print / Save as PDF</button><button onclick="window.close()">Close</button></div>' +
    '<h1>Cleaning Validation Protocol</h1><p><strong>Generated:</strong> ' + escapeHtml(today) + '</p>' +
    reportMeta(data) +
    '<h2>Objective</h2><p>To demonstrate that the cleaning procedure effectively removes residue, cleaning solvent, detergent where used, and microbial/particulate contamination to acceptable levels.</p>' +
    '<h2>Sampling Plan</h2>' + table(['Sample Type','Location / Purpose','Acceptance Criteria'], [
      ['Swab sample','Worst-case product contact surfaces, joints, valves, agitator, discharge points, gaskets, filters','Residue below calculated swab limit'],
      ['Rinse sample','Final rinse after cleaning','Residue below calculated rinse limit'],
      ['Visual inspection','Accessible equipment surfaces','No visible residue, stain, or foreign matter'],
      ['Microbial sample','Where water-based cleaning or hold-time risk exists','Within approved microbiological limits']
    ]) +
    '<h2>MACO / Limit Calculation Template</h2>' + table(['Calculation Element','Requirement'], [
      ['Health-based limit','Use PDE/ADE where available; otherwise justify 10 ppm, dose-based, or visual cleanliness approach'],
      ['Swab limit','MACO x swab area / total shared product contact surface area'],
      ['Rinse limit','MACO / final rinse volume, adjusted for recovery factor'],
      ['Recovery','Analytical recovery must be established for surface/material and residue type']
    ]) +
    '<h2>Approval</h2>' + signatureTable() + '</div>';
}

export function buildProcessValidationReport(data) {
  const today = new Date().toLocaleDateString();
  return '<div class="report-shell">' +
    '<div class="report-actions"><button onclick="window.print()">Print / Save as PDF</button><button onclick="window.close()">Close</button></div>' +
    '<h1>Process Validation Protocol</h1><p><strong>Generated:</strong> ' + escapeHtml(today) + '</p>' +
    reportMeta(data) +
    '<h2>Objective</h2><p>To provide documented evidence that the manufacturing process consistently produces API meeting predefined quality attributes and acceptance criteria.</p>' +
    '<h2>Validation Strategy</h2>' + table(['Item','Requirement'], [
      ['Approach','Prospective validation using three consecutive successful validation/commercial-scale batches unless justified otherwise'],
      ['CPPs','Define and monitor critical process parameters for each unit operation'],
      ['CQAs','Assay, related substances, residual solvents, water/LOD, particle size, polymorphic form and other product-specific quality attributes'],
      ['Hold time','Verify intermediate, wet cake, dried API and packed API hold times where applicable']
    ]) +
    '<h2>Approval</h2>' + signatureTable() + '</div>';
}

function reportMeta(data) {
  return '<div class="report-meta">' +
    '<div><strong>Product Name</strong><br>' + escapeHtml(data.productName || '') + '</div>' +
    '<div><strong>Product Code</strong><br>' + escapeHtml(data.productCode || '') + '</div>' +
    '<div><strong>Equipment / Line</strong><br>' + escapeHtml(data.equipment || 'To be defined') + '</div>' +
    '<div><strong>Batch / Campaign Size</strong><br>' + escapeHtml(data.batchSize || 'To be defined') + '</div>' +
  '</div>';
}
