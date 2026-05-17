import { containsAny, escapeHtml, extractNumber, normalizeText } from './utils.js';
import { openPrintableReport, signatureTable, table } from './reports.js';

let lastEquipmentPlan = null;

export function generateEquipmentPlan(data, addMessage) {
  const equipment = parseEquipmentMaster(data.equipmentText);
  const steps = inferProcessSteps(data.processText, data);
  if (!equipment.length) throw new Error('No equipment could be parsed. Add rows with equipment tag/type/capacity.');
  if (!steps.length) throw new Error('No process steps could be inferred. Add process step lines or operation descriptions.');
  const mapped = mapEquipmentToSteps(steps, equipment);
  const summary = summarizeProductionPlan(mapped, equipment, data);
  lastEquipmentPlan = { data, equipment, steps: mapped, summary };
  addMessage('assistant', renderEquipmentPlanHtml(lastEquipmentPlan));
  return lastEquipmentPlan;
}

export function printLastEquipmentPlan() {
  if (!lastEquipmentPlan) {
    alert('Generate an equipment plan first.');
    return;
  }
  openPrintableReport(buildEquipmentPlanReport(lastEquipmentPlan), 'Equipment Mapping and Production Planning');
}

export function parseEquipmentMaster(text) {
  const rows = parseRows(text);
  return rows.map((row, index) => {
    const joined = Object.values(row).join(' ');
    const type = detectEquipmentType(joined);
    const capacityText = getAny(row, ['capacity', 'working volume', 'max volume', 'size', 'load', 'working capacity', 'volume']) || joined;
    const minText = getAny(row, ['min', 'minimum', 'minimum volume', 'min volume']) || '';
    const maxText = getAny(row, ['max', 'maximum', 'maximum volume', 'max volume']) || capacityText;
    return {
      id: getAny(row, ['equipment id', 'id', 'tag', 'equipment tag', 'equipment', 'name']) || 'EQ-' + (index + 1),
      type,
      rawType: getAny(row, ['type', 'equipment type', 'category']) || type,
      capacity: normalizeCapacity(capacityText),
      minCapacity: normalizeCapacity(minText) || 0,
      maxCapacity: normalizeCapacity(maxText) || normalizeCapacity(capacityText),
      moc: getAny(row, ['moc', 'material', 'material of construction']) || detectMoc(joined),
      agitator: getAny(row, ['agitator', 'agitator type']) || findKeyword(joined, ['anchor', 'turbine', 'pitch blade', 'paddle', 'propeller', 'magnetic']),
      baffles: getAny(row, ['baffle', 'baffles', 'baffle detail']) || (containsAny(joined, ['baffle']) ? 'Available' : 'Not specified'),
      cleaningHours: extractDurationHours(getAny(row, ['cleaning', 'cleaning time', 'changeover']) || '') || defaultCleaningHours(type),
      location: getAny(row, ['area', 'block', 'location']) || 'Not specified'
    };
  }).filter(eq => eq.id && eq.type !== 'unknown');
}

export function inferProcessSteps(text, data) {
  const rows = parseRows(text);
  const usableRows = rows.length > 1 ? rows : text.split(/\r?\n/).map((line, i) => ({ step: String(i + 1), description: line.trim() })).filter(r => r.description);
  return usableRows.map((row, index) => {
    const desc = Object.values(row).join(' ');
    const type = detectEquipmentType(desc);
    const duration = extractDurationHours(desc) || defaultStepHours(type);
    const load = extractCapacityWithUnit(desc) || estimateLoad(type, data.batchSizeKg);
    const moc = inferRequiredMoc(desc);
    return {
      stepNo: getAny(row, ['step', 'step no', 'sr no', 'stage']) || String(index + 1),
      description: getAny(row, ['description', 'process', 'operation', 'activity']) || desc,
      type,
      requiredLoad: load,
      durationHours: duration,
      cleaningHours: defaultCleaningHours(type),
      requiredMoc: moc,
      dependency: index === 0 ? 'Start' : 'After step ' + index
    };
  }).filter(step => step.description && step.type !== 'unknown');
}

function parseRows(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const delimiter = lines[0].includes('\t') ? '\t' : lines[0].includes('|') ? '|' : ',';
  const first = splitRow(lines[0], delimiter);
  const hasHeader = first.some(cell => /equipment|tag|type|capacity|step|operation|process|description|moc/i.test(cell));
  if (!hasHeader) return lines.map((line, i) => ({ index: String(i + 1), description: line }));
  const headers = first.map(h => normalizeHeader(h));
  return lines.slice(1).map(line => {
    const cells = splitRow(line, delimiter);
    const row = {};
    headers.forEach((header, i) => { row[header] = cells[i] || ''; });
    return row;
  });
}

function splitRow(line, delimiter) {
  return line.split(delimiter).map(v => v.trim()).filter((v, i, arr) => delimiter !== '|' || v || (i > 0 && i < arr.length - 1));
}

function normalizeHeader(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function getAny(row, names) {
  for (const name of names) {
    const key = normalizeHeader(name);
    if (row[key]) return row[key];
  }
  return '';
}

function detectEquipmentType(text) {
  const t = normalizeText(text);
  if (containsAny(t, ['centrifuge', 'centrifugal'])) return 'centrifuge';
  if (containsAny(t, ['filter dryer', 'anfd', 'nutsche'])) return 'filter dryer';
  if (containsAny(t, ['filter', 'filtration', 'sparkler', 'leaf filter', 'pressure filter'])) return 'filter';
  if (containsAny(t, ['dryer', 'drying', 'tray dryer', 'vtd', 'fbd', 'vacuum dryer'])) return 'dryer';
  if (containsAny(t, ['mill', 'milling', 'sieve', 'sifter', 'multimill'])) return 'mill';
  if (containsAny(t, ['reactor', 'reaction', 'reflux', 'distillation', 'hydrogenation', 'charge', 'stir', 'agitator', 'crystallization'])) return 'reactor';
  if (containsAny(t, ['blender', 'blending', 'mixer'])) return 'blender';
  return 'unknown';
}

function findKeyword(text, words) {
  const t = String(text || '').toLowerCase();
  return words.find(word => t.includes(word)) || 'Not specified';
}

function extractCapacityWithUnit(text) {
  const t = String(text || '').toLowerCase();
  const unitMatch = t.match(/(\d+(?:\.\d+)?)\s*(kl|kilo\s*liter|kiloliters?|l|ltr|liters?|kg|kgs?)\b/);
  if (!unitMatch) return 0;
  const value = Number(unitMatch[1]);
  return /kl|kilo|kilolit/.test(unitMatch[2]) ? value * 1000 : value;
}

function normalizeCapacity(text) {
  return extractCapacityWithUnit(text) || extractNumber(text) || 0;
}

function extractDurationHours(text) {
  const t = String(text || '').toLowerCase();
  const hour = t.match(/(\d+(?:\.\d+)?)\s*(?:hr|hrs|hour|hours|h)\b/);
  if (hour) return Number(hour[1]);
  const min = t.match(/(\d+(?:\.\d+)?)\s*(?:min|mins|minute|minutes)\b/);
  return min ? Math.round((Number(min[1]) / 60) * 10) / 10 : 0;
}

function inferRequiredMoc(text) {
  const t = String(text || '').toLowerCase();
  if (containsAny(t, ['hcl', 'hydrochloric', 'sulfuric', 'sulphuric', 'nitric', 'acid chloride', 'thionyl', 'corrosive'])) return 'GLR/Hastelloy preferred';
  if (containsAny(t, ['methanol', 'ethanol', 'acetone', 'ipa', 'toluene', 'ethyl acetate', 'organic solvent'])) return 'SS316L/GLR';
  return 'SS316L or equivalent';
}

function detectMoc(text) {
  const t = String(text || '').toLowerCase();
  if (containsAny(t, ['hastelloy'])) return 'Hastelloy';
  if (containsAny(t, ['glass lined', 'glr'])) return 'GLR';
  if (containsAny(t, ['316', 'ss316', 'ss 316'])) return 'SS316L';
  if (containsAny(t, ['304', 'ss304', 'ss 304'])) return 'SS304';
  return 'Not specified';
}

function defaultStepHours(type) {
  return ({ reactor: 8, centrifuge: 3, filter: 4, 'filter dryer': 8, dryer: 10, mill: 2, blender: 2 })[type] || 4;
}

function defaultCleaningHours(type) {
  return ({ reactor: 4, centrifuge: 3, filter: 3, 'filter dryer': 5, dryer: 4, mill: 2, blender: 2 })[type] || 3;
}

function estimateLoad(type, batchKg) {
  if (!batchKg) return 0;
  if (type === 'reactor') return Math.ceil(batchKg * 3);
  if (type === 'dryer' || type === 'centrifuge' || type === 'filter dryer') return Math.ceil(batchKg * 1.2);
  return Math.ceil(batchKg);
}

function mapEquipmentToSteps(steps, equipment) {
  return steps.map(step => {
    const candidates = equipment
      .filter(eq => eq.type === step.type || compatibleType(eq.type, step.type))
      .map(eq => ({ eq, score: equipmentScore(eq, step), reason: equipmentReason(eq) }))
      .filter(item => item.score > -999)
      .sort((a, b) => b.score - a.score);
    return { ...step, selected: candidates[0]?.eq || null, candidates: candidates.slice(0, 3) };
  });
}

function compatibleType(equipmentType, stepType) {
  return (stepType === 'filter' && equipmentType === 'filter dryer') || (stepType === 'dryer' && equipmentType === 'filter dryer');
}

function equipmentScore(eq, step) {
  if (step.requiredLoad && eq.maxCapacity && eq.maxCapacity < step.requiredLoad) return -1000;
  if (step.requiredLoad && eq.minCapacity && eq.minCapacity > step.requiredLoad) return -1000;
  let score = 100;
  if (step.requiredLoad && eq.maxCapacity) score -= Math.min(40, Math.abs(eq.maxCapacity - step.requiredLoad) / Math.max(step.requiredLoad, 1) * 10);
  if (mocMatches(eq.moc, step.requiredMoc)) score += 15;
  if (eq.agitator && eq.agitator !== 'Not specified' && step.type === 'reactor') score += 5;
  return score;
}

function mocMatches(actual, required) {
  const a = String(actual || '').toLowerCase();
  const r = String(required || '').toLowerCase();
  if (r.includes('glr') || r.includes('hastelloy')) return a.includes('glr') || a.includes('glass') || a.includes('hastelloy');
  if (r.includes('ss316')) return a.includes('316') || a.includes('glr') || a.includes('hastelloy') || a.includes('not specified');
  return true;
}

function equipmentReason(eq) {
  const capacity = eq.maxCapacity ? eq.maxCapacity + ' capacity' : 'capacity not specified';
  return capacity + '; MOC ' + eq.moc + '; cleaning ' + eq.cleaningHours + ' h';
}

function summarizeProductionPlan(steps, equipment, data) {
  const totalCycle = steps.reduce((sum, step) => sum + step.durationHours + step.cleaningHours, 0);
  const byType = {};
  steps.forEach(step => {
    const available = equipment.filter(eq => eq.type === step.type || compatibleType(eq.type, step.type)).length || 1;
    byType[step.type] ||= { hours: 0, available };
    byType[step.type].hours += step.durationHours + step.cleaningHours;
  });
  const bottlenecks = Object.entries(byType).map(([type, info]) => ({ type, available: info.available, loadHours: Math.round((info.hours / info.available) * 10) / 10 })).sort((a, b) => b.loadHours - a.loadHours);
  const chargingInterval = bottlenecks[0]?.loadHours || totalCycle;
  const batchesPerDay = data.workingHoursPerDay ? data.workingHoursPerDay / chargingInterval : 24 / chargingInterval;
  const monthlyKg = data.batchSizeKg ? Math.floor(batchesPerDay * 26 * data.batchSizeKg) : 0;
  return { totalCycle: round1(totalCycle), chargingInterval: round1(chargingInterval), batchesPerDay: round2(batchesPerDay), monthlyKg, bottleneck: bottlenecks[0] || null, unmapped: steps.filter(step => !step.selected).length };
}

function round1(value) { return Math.round(value * 10) / 10; }
function round2(value) { return Math.round(value * 100) / 100; }

function renderEquipmentPlanHtml(plan) {
  const rows = plan.steps.map(step => [step.stepNo, step.type, step.requiredLoad || '-', step.durationHours + ' h', step.selected ? step.selected.id : 'No match', step.candidates.map(c => c.eq.id).join(', ') || '-']);
  return '<div class="planner-output"><h3>Equipment Mapping and Production Plan</h3>' +
    '<div class="planner-summary">' +
      plannerKpi('Product', plan.data.productName + ' / ' + plan.data.productCode) +
      plannerKpi('Batch Size', plan.data.batchSizeText) +
      plannerKpi('Cycle Time', plan.summary.totalCycle + ' h') +
      plannerKpi('Charging Interval', plan.summary.chargingInterval + ' h') +
      plannerKpi('Estimated Output', plan.summary.monthlyKg ? plan.summary.monthlyKg + ' kg/month' : 'Target not calculated') +
      plannerKpi('Bottleneck', plan.summary.bottleneck ? plan.summary.bottleneck.type + ' (' + plan.summary.bottleneck.loadHours + ' h)' : 'None') +
    '</div>' + table(['Step','Equipment Type','Load/Volume','Duration','Selected Equipment','Alternates'], rows) +
    '<p><strong>Planning note:</strong> Use multiple mapped equipment in the bottleneck stage to reduce charging interval. Review inferred loads, MOC, and cleaning assumptions before final scheduling.</p>' +
    '<button class="mini-action" id="inline-print-plan">Print / Save Plan PDF</button></div>';
}

function plannerKpi(label, value) {
  return '<div class="planner-kpi"><b>' + escapeHtml(label) + '</b><span>' + escapeHtml(value) + '</span></div>';
}

function buildEquipmentPlanReport(plan) {
  const today = new Date().toLocaleDateString();
  const mappingRows = plan.steps.map(step => [step.stepNo, step.description, step.type, step.requiredLoad || '-', step.requiredMoc, step.durationHours + ' h', step.cleaningHours + ' h', step.selected ? step.selected.id : 'No suitable equipment', step.candidates.map(c => c.eq.id + ' (' + c.reason + ')').join('; ') || '-']);
  const eqRows = plan.equipment.map(eq => [eq.id, eq.type, eq.minCapacity || '-', eq.maxCapacity || eq.capacity || '-', eq.moc, eq.agitator, eq.baffles, eq.cleaningHours + ' h', eq.location]);
  return '<div class="report-shell">' +
    '<div class="report-actions"><button onclick="window.print()">Print / Save as PDF</button><button onclick="window.close()">Close</button></div>' +
    '<h1>Equipment Mapping and Production Planning Report</h1><p><strong>Generated:</strong> ' + escapeHtml(today) + '</p>' +
    '<div class="report-meta"><div><strong>Product Name</strong><br>' + escapeHtml(plan.data.productName) + '</div><div><strong>Product Code</strong><br>' + escapeHtml(plan.data.productCode) + '</div><div><strong>Batch Size</strong><br>' + escapeHtml(plan.data.batchSizeText) + '</div><div><strong>Working Hours/Day</strong><br>' + escapeHtml(plan.data.workingHoursPerDay) + '</div></div>' +
    '<h2>1. Planning Summary</h2>' + table(['Parameter','Result'], [['Estimated batch cycle time', plan.summary.totalCycle + ' h'], ['Estimated minimum charging interval', plan.summary.chargingInterval + ' h'], ['Estimated batches/day', String(plan.summary.batchesPerDay)], ['Estimated monthly output', plan.summary.monthlyKg ? plan.summary.monthlyKg + ' kg/month' : 'Not calculated'], ['Primary bottleneck', plan.summary.bottleneck ? plan.summary.bottleneck.type + ' stage' : 'None'], ['Unmapped process steps', String(plan.summary.unmapped)]]) +
    '<h2>2. Equipment Master Used</h2>' + table(['Equipment','Type','Min','Max/Capacity','MOC','Agitator','Baffles','Cleaning','Location'], eqRows) +
    '<h2>3. Process Step Mapping</h2>' + table(['Step','Process Description','Required Type','Load/Volume','Required MOC','Process Time','Cleaning Time','Selected Equipment','Alternate Options'], mappingRows) +
    '<h2>4. Bottleneck and Multi-Equipment Strategy</h2><p>The minimum charging interval is estimated from the highest equipment-family load after considering available parallel equipment.</p>' +
    '<h2>5. Assumptions</h2><ul><li>Process requirements were inferred from uploaded text/table and must be reviewed by Production, QA, QC and Engineering.</li><li>Capacity units are treated as comparable planning units where exact basis is not supplied.</li><li>Cleaning time uses equipment-type defaults unless provided in the equipment master.</li></ul>' +
    '<h2>6. Approval</h2>' + signatureTable() + '</div>';
}
