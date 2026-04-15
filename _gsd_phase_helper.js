const { execSync } = require('child_process');
const result = execSync('node .agent/get-shit-done/bin/gsd-tools.cjs init plan-phase 1', { encoding: 'utf8' });
const j = JSON.parse(result);
const lines = [
  'PHASE_DIR=' + j.phase_dir,
  'PADDED_PHASE=' + j.padded_phase,
  'COMMIT_DOCS=' + j.commit_docs,
];
lines.forEach(l => console.log(l));
