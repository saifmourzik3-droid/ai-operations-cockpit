'use strict';
const fixtures = require('./fixtures/operations.json');
const freshOperations = () => structuredClone(fixtures);
function metrics(rows) {
  return {total: rows.length, active: rows.filter(r => r.status === 'active').length,
    attention: rows.filter(r => r.status === 'attention').length,
    completed: rows.filter(r => r.status === 'completed').length,
    revenue: rows.reduce((n, r) => n + r.revenue, 0),
    contribution: rows.reduce((n, r) => n + r.revenue - r.directCost, 0)};
}
function setTask(rows, id, index, done) {
  const row = rows.find(r => r.id === id);
  if (!row || !Number.isInteger(index) || !row.checklist[index] || typeof done !== 'boolean') {
    throw Object.assign(Error('Invalid checklist update'), {status: 400});
  }
  row.checklist[index].done = done;
  row.status = row.checklist.every(t => t.done) ? 'completed' : row.team === 'Unassigned' ? 'attention' : 'active';
  return row;
}
function simulatedAssistant(question, rows) {
  if (typeof question !== 'string' || !question.trim() || question.length > 1000) throw Object.assign(Error('Question must contain 1–1000 characters'), {status: 400});
  const q = question.toLowerCase(), m = metrics(rows);
  let answer, references;
  if (/risk|attention|urgent|block|priorit/.test(q)) {
    references = rows.filter(r => r.status === 'attention').map(r => r.id);
    answer = references.length ? `Review ${references.join(', ')}. Assign a demo team and confirm the remaining checklist steps. A human must approve any operational decision.` : 'No operation is currently marked for attention.';
  } else if (/revenue|finance|cost|margin/.test(q)) {
    references = rows.map(r => r.id);
    answer = `Synthetic revenue: EUR ${m.revenue}. Revenue minus direct cost: EUR ${m.contribution}. This excludes overhead and tax and is not net profit.`;
  } else if (/summary|overview|status/.test(q)) {
    references = rows.map(r => r.id);
    answer = `${m.total} fictional operations: ${m.active} active, ${m.attention} requiring attention, ${m.completed} completed. Dates belong to a fixed June 2030 scenario.`;
  } else {
    references = [];
    answer = 'This offline simulator supports operational summary, priorities and financial summary. It cannot answer general questions or execute instructions.';
  }
  return {answer, references, provider: 'deterministic-demo', simulated: true};
}
function exportCSV(rows) {
  const cell = value => '"' + String(value).replace(/^[=+@\-\t\r]/, "'$&").replaceAll('"', '""') + '"';
  return [['Reference','Asset','Client','Site','Status','Revenue EUR','Direct cost EUR'],
    ...rows.map(r => [r.id,r.asset,r.client,r.site,r.status,r.revenue,r.directCost])].map(r => r.map(cell).join(',')).join('\r\n');
}
module.exports = {freshOperations, metrics, setTask, simulatedAssistant, exportCSV};
