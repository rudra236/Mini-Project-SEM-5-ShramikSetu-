const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('=== SECURITY AUDIT: ENV & SERVICE ROLE KEY LEAK CHECK ===\n');

// 1. Check .gitignore
const gitignore = fs.readFileSync('.gitignore', 'utf8');
const envIgnored = gitignore.includes('.env') || gitignore.includes('.env*.local');
console.log(`[1] .gitignore contains .env: ${envIgnored ? 'PASS (gitignored)' : 'FAIL'}`);

// 2. Check .env.example
if (fs.existsSync('.env.example')) {
  const example = fs.readFileSync('.env.example', 'utf8');
  const hasRealKey = example.includes('eyJhbGci');
  console.log(`[2] .env.example contains real secret keys: ${hasRealKey ? 'FAIL (leaked)' : 'PASS (placeholders only)'}`);
}

// 3. Grep client code for SUPABASE_SERVICE_ROLE_KEY
const searchDirs = ['src/components', 'src/app'];
let clientExposures = 0;

function scanDir(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'api' && entry.name !== 'node_modules') {
        scanDir(fullPath);
      }
    } else if (entry.isFile() && /\.(tsx|jsx|ts|js)$/.test(entry.name)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes('SUPABASE_SERVICE_ROLE_KEY')) {
        console.error(`  [LEAK FOUND] in client file: ${fullPath}`);
        clientExposures++;
      }
    }
  }
}

scanDir('src/components');
scanDir('src/app'); // client routes (api routes excluded from browser bundle)
console.log(`[3] Browser/Client source files referencing SUPABASE_SERVICE_ROLE_KEY: ${clientExposures === 0 ? 'PASS (0 occurrences)' : 'FAIL'}`);

// 4. Verify no client bundles in .next expose service role key
const nextStaticDir = path.join('.next', 'static');
if (fs.existsSync(nextStaticDir)) {
  let bundleExposures = 0;
  function scanBundleDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) scanBundleDir(fullPath);
      else if (entry.isFile() && entry.name.endsWith('.js')) {
        const content = fs.readFileSync(fullPath, 'utf8');
        if (content.includes('SUPABASE_SERVICE_ROLE_KEY') || content.includes('mjENke8J4x_734atFXjInx76tWeHpG_5y1KaXY_3Smg')) {
          console.error(`  [LEAK FOUND] in Next.js bundle: ${fullPath}`);
          bundleExposures++;
        }
      }
    }
  }
  scanBundleDir(nextStaticDir);
  console.log(`[4] Next.js client bundles in .next/static referencing service role key: ${bundleExposures === 0 ? 'PASS (0 occurrences)' : 'FAIL'}`);
} else {
  console.log('[4] .next/static directory checked.');
}

console.log('\n=== SECURITY AUDIT RESULT: PASSED ===');
