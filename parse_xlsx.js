// Parse the xlsx CSV output and generate the staticHubData JSON
// Final version with proper ID generation matching existing conventions

const fs = require('fs');

let input = fs.readFileSync('spreadsheet_data.csv', 'utf-8');
input = input.replace(/\0/g, '').replace(/^\uFEFF/, '');

const lines = input.trim().split('\n').filter(l => l.trim());

const chainColumns = {
  5: 'ethereum', 6: 'base', 7: 'polygon', 8: 'avalanche', 9: 'optimism',
  10: 'arbitrum', 11: 'abstract', 12: 'blast', 13: 'zora', 14: 'apechain',
  15: 'soneium', 16: 'ronin', 17: 'worldchain', 18: 'gnosis', 19: 'hyperevm',
  20: 'monad', 21: 'solana', 22: 'cardano'
};

const totalChains = 18;

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
    else { current += ch; }
  }
  result.push(current.trim());
  return result;
}

const dataLines = lines.slice(1);
const apps = [];
const categoryMap = {};

for (const line of dataLines) {
  const cols = parseCSVLine(line);
  const name = cols[0];
  const category = cols[1];
  const website = cols[2];
  const favicon = cols[3];
  
  if (!name || !category || !website) continue;
  
  const chains = [];
  for (const [idx, chainId] of Object.entries(chainColumns)) {
    const val = (cols[parseInt(idx)] || '').trim().toUpperCase();
    if (val === 'X') chains.push(chainId);
  }
  
  const chainCount = chains.length;
  const coverage = Math.round((chainCount / totalChains) * 100);
  
  // Generate ID: dots->dashes, slashes->dashes, special chars removed, lowercase
  const id = name.toLowerCase()
    .replace(/\./g, '-')           // dots to dashes (Book.io -> book-io)
    .replace(/[^a-z0-9\s\-\/]/g, '')
    .replace(/\s*\/\s*/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  
  apps.push({
    id, name, website, category, chains, chainCount, coverage,
    featured: false,
    favicon: favicon.replace('sz=128', 'sz=64'),
    categoryMeta: { description: "Description here." }
  });
  
  if (!categoryMap[category]) {
    categoryMap[category] = { name: category, short: category.split(' ')[0], count: 0 };
  }
  categoryMap[category].count++;
}

const categories = Object.values(categoryMap).sort((a, b) => a.name.localeCompare(b.name));

const chainLabels = {
  ethereum: 'Ethereum', base: 'Base', polygon: 'Polygon', avalanche: 'Avalanche',
  optimism: 'Optimism', arbitrum: 'Arbitrum', abstract: 'Abstract', blast: 'Blast',
  zora: 'Zora', apechain: 'ApeChain', soneium: 'Soneium', ronin: 'Ronin',
  worldchain: 'WorldChain', gnosis: 'Gnosis', hyperevm: 'HyperEVM', monad: 'Monad',
  solana: 'Solana', cardano: 'Cardano'
};

const chainsArr = Object.keys(chainLabels).sort().map(id => ({ id, label: chainLabels[id] }));

const result = {
  totalApps: apps.length,
  totalChains,
  chains: chainsArr,
  categories,
  chainStats: [],
  apps
};

const json = JSON.stringify(result);
fs.writeFileSync('generated_hub_data.json', json, 'utf-8');
console.log(`Total: ${apps.length} apps, ${Object.keys(categoryMap).length} categories`);
console.log('Categories:', categories.map(c => `${c.name} (${c.count})`).join(', '));

// Verify no duplicates
const ids = apps.map(a => a.id);
const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
if (dupes.length) console.log('DUPLICATES:', dupes);
else console.log('No duplicate IDs ✓');
