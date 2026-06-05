// Apply the generated JSON to the index.html file
const fs = require('fs');

const htmlPath = 'public/index.html';
const jsonPath = 'generated_hub_data.json';

const html = fs.readFileSync(htmlPath, 'utf-8');
const newJson = fs.readFileSync(jsonPath, 'utf-8').trim();

// 1. Replace the staticHubData line
const staticDataRegex = /const staticHubData = \{.*?\};/;
const newLine = `const staticHubData = ${newJson};`;

if (!staticDataRegex.test(html)) {
  console.error('ERROR: Could not find staticHubData line!');
  process.exit(1);
}

let updated = html.replace(staticDataRegex, newLine);

// 2. Add new category styles (Social / Trading Hub, Launchpad / DEX, Gaming / Ecosystem)
// Find the closing brace of appHubCategoryStyles and insert before it
const newStyles = `
        'Social / Trading Hub': {
          pill: 'text-pink-500 bg-pink-500/10 border-pink-500/20',
          icon: 'bg-pink-500 text-white',
          ring: 'ring-pink-500/30'
        },
        'Launchpad / DEX': {
          pill: 'text-rose-500 bg-rose-500/10 border-rose-500/20',
          icon: 'bg-rose-500 text-white',
          ring: 'ring-rose-500/30'
        },
        'Gaming / Ecosystem': {
          pill: 'text-teal-500 bg-teal-500/10 border-teal-500/20',
          icon: 'bg-teal-500 text-white',
          ring: 'ring-teal-500/30'
        }`;

// Insert before the closing of appHubCategoryStyles
// The pattern ends with: 'Native & Cross-Chain Wallet': { ... }  };
const walletStyleEnd = "'Native \\u0026 Cross-Chain Wallet'";
// Actually let's find the exact pattern - the last entry before the closing }
const categoryStylesEnd = /'Native & Cross-Chain Wallet': \{\s*pill: '[^']+',\s*icon: '[^']+',\s*ring: '[^']+'\s*\}\s*\};/;

// Simpler approach: find the pattern and add after the last entry
const insertPoint = "ring: 'ring-orange-500/30'\n        }\n      };";
const insertReplacement = `ring: 'ring-orange-500/30'\n        },${newStyles}\n      };`;

if (updated.includes(insertPoint)) {
  updated = updated.replace(insertPoint, insertReplacement);
  console.log('✅ Added 3 new category styles');
} else {
  console.error('WARNING: Could not find category styles insertion point, trying alternate...');
  // Try alternate pattern
  const alt = "ring: 'ring-orange-500/30'\r\n        }\r\n      };";
  if (updated.includes(alt)) {
    updated = updated.replace(alt, `ring: 'ring-orange-500/30'\r\n        },${newStyles}\r\n      };`);
    console.log('✅ Added 3 new category styles (alt pattern)');
  } else {
    console.error('ERROR: Could not find category styles insertion point!');
  }
}

// Write the updated HTML
fs.writeFileSync(htmlPath, updated, 'utf-8');

// Verify
const verify = fs.readFileSync(htmlPath, 'utf-8');
const appCount = (verify.match(/"id":/g) || []).length;
console.log(`✅ Updated index.html`);
console.log(`   - staticHubData replaced (${newJson.length} chars)`);
console.log(`   - App entries found in file: ~${appCount}`);
console.log(`   - File size: ${verify.length} bytes`);
console.log(`   - Gaming / Ecosystem present: ${verify.includes("Gaming / Ecosystem")}`);
console.log(`   - Launchpad / DEX present: ${verify.includes("Launchpad / DEX")}`);
console.log(`   - Social / Trading Hub present: ${verify.includes("Social / Trading Hub")}`);
