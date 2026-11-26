import * as fs from 'node:fs';
import * as path from 'node:path';

const lockPath = process.env.ACTIONS_LOCK_PATH || '.github/actions-pins.lock.json';
const workflowsDir = process.env.WORKFLOWS_DIR || '.github/workflows';

if (!fs.existsSync(lockPath)) {
  console.error(`ERROR: Lockfile not found at ${lockPath}`);
  process.exit(1);
}

const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
let failed = false;

const yamlFiles = fs.readdirSync(workflowsDir).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));

for (const yf of yamlFiles) {
  const filePath = path.join(workflowsDir, yf);
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Match `uses: <repo>/<action>@<sha>`
  // e.g. `uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2`
  const regex = /uses:\s+([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)@([a-f0-9]{40}|[^\s#]+)/g;
  let match;
  let count = 0;
  
  while ((match = regex.exec(content)) !== null) {
    const actionName = match[1];
    const shaOrRef = match[2];
    count++;
    
    // Check if 40-hex SHA
    if (!/^[a-f0-9]{40}$/.test(shaOrRef)) {
      console.error(`[FAIL] ${yf}: Action ${actionName} is pinned with tag/ref "${shaOrRef}" instead of a 40-char SHA`);
      failed = true;
      continue;
    }
    
    // Check if present in actions.lock (by key prefix or exact match)
    const lockEntry = Object.entries(lock).find(([key]) => key.split('@')[0] === actionName);
    if (!lockEntry) {
      console.error(`[FAIL] ${yf}: Action ${actionName} not registered in ${lockPath}`);
      failed = true;
      continue;
    }
    
    if (lockEntry[1] !== shaOrRef) {
      console.error(`[FAIL] ${yf}: Action ${actionName} SHA mismatch! Workflow has ${shaOrRef}, lockfile has ${lockEntry[1]}`);
      failed = true;
      continue;
    }
    
    console.log(`[PASS] ${yf}: ${actionName}@${shaOrRef.slice(0, 7)} matches actions.lock (${lockEntry[0]})`);
  }
}

if (failed) {
  console.error('\nActions lock verification FAILED.');
  process.exit(1);
} else {
  console.log(`\nAll GitHub Action SHAs match ${lockPath} cleanly.`);
}
