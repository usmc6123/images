const http = require('http');
const crypto = require('crypto');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = 9001;
const WORKSPACE = '/workspace';
const CORE_RAW = 'https://raw.githubusercontent.com/usmc6123/images/main/workshop-core';

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function restoreCoreFiles() {
  log('Restoring protected core files from images repo...');

  const files = [
    { url: `${CORE_RAW}/lemon-website`, dest: `${WORKSPACE}/lemon-server/lemon-website`, chmod: true },
    { url: `${CORE_RAW}/Dockerfile`, dest: `${WORKSPACE}/lemon-server/Dockerfile`, chmod: false },
    { url: `${CORE_RAW}/ingestion.js`, dest: `${WORKSPACE}/backend/ingestion.js`, chmod: false },
    { url: `${CORE_RAW}/post-rebuild.sh`, dest: `${WORKSPACE}/post-rebuild.sh`, chmod: true },
  ];

  for (const file of files) {
    try {
      execSync(`mkdir -p ${path.dirname(file.dest)}`);
      execSync(`wget -q -O ${file.dest} "${file.url}"`);
      if (file.chmod) execSync(`chmod +x ${file.dest}`);
      log(`Restored: ${file.dest}`);
    } catch (e) {
      log(`ERROR restoring ${file.dest}: ${e.message}`);
    }
  }
}

function runRebuild() {
  log('Running post-rebuild.sh...');
  try {
    const out = execSync(`bash ${WORKSPACE}/post-rebuild.sh`, { timeout: 300000 });
    log(out.toString());
  } catch (e) {
    log(`ERROR in post-rebuild.sh: ${e.message}`);
  }
}

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/webhook') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    res.writeHead(200);
    res.end('OK');

    log('Webhook received — starting restore + rebuild...');
    try {
      // Pull latest code
      execSync(`cd ${WORKSPACE} && git pull origin main`, { timeout: 60000 });
      log('Git pull complete');
    } catch (e) {
      log(`Git pull warning: ${e.message}`);
    }

    // Always restore core files from images repo
    restoreCoreFiles();

    // Run rebuild
    runRebuild();
    log('Rebuild complete!');
  });
});

server.listen(PORT, () => {
  log(`Webhook server listening on port ${PORT}`);
});
