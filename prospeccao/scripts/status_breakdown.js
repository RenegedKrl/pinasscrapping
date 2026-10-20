const fs = require('fs');
const path = require('path');

const leads = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'leads.json'), 'utf8'));

const statusCount = {};
leads.forEach(l => {
  statusCount[l.status] = (statusCount[l.status] || 0) + 1;
});
console.log('Status breakdown in leads.json:', statusCount);

const respondeuLeads = leads.filter(l => l.status === 'respondeu');
console.log(`\nTotal leads with status 'respondeu': ${respondeuLeads.length}`);
respondeuLeads.forEach(l => {
  console.log(`- ${l.name} (${l.cleanPhone}) | Stage: ${l.stage} | Manual: ${l.manualControl || false}`);
});
