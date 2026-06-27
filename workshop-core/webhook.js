const http = require('http');
const { execSync } = require('child_process');
const path = require('path');

const PORT = 9001;
const WORKSPACE = '/workspace';
const CORE_RAW = 'https://raw.githubusercontent.com/usmc6123/images/main/workshop-core';
const IMAGE_NAME = 'workspace-workshop-backend';

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
    { url: `${CORE_RAW}/package-lock.json`, dest: `${WORKSPACE}/package-lock.json`, chmod: false },
    { url: `${CORE_RAW}/backend-package-lock.json`, dest: `${WORKSPACE}/backend/package-lock.json`, chmod: false },
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

    log('Webhook received - starting restore + rebuild...');

    try {
      execSync(`cd ${WORKSPACE} && git reset --hard HEAD && git pull origin main`, { timeout: 60000 });
      log('Git pull complete');
    } catch (e) {
      log(`Git pull warning: ${e.message}`);
    }

    restoreCoreFiles();

    try {
      log('Building Docker image...');
      execSync(`cd ${WORKSPACE} && docker compose build workshop-backend`, { timeout: 600000 });
      log('Build complete - swapping container...');
      try { execSync(`docker stop ragnarok-backend`, { timeout: 30000 }); } catch(e) {}
      try { execSync(`docker rm ragnarok-backend`, { timeout: 30000 }); } catch(e) {}
      log('Starting new container with new image...');
      execSync(`docker run -d --name ragnarok-backend --network workshop-ragnarok_default -p 4000:4000 -e PORT=4000 -e LEMON_SERVER_URL=http://lemon-server:8080 -e DB_PATH=/data/db/workshop.db -v /mnt/d/HomeServer/workshop-ragnarok/data:/data --restart unless-stopped ${IMAGE_NAME}`, { timeout: 60000 });
      log('Container started successfully with new image');
    } catch (e) {
      log(`ERROR during rebuild: ${e.message}`);
    }

    try {
      log('Running ingestion check...');
      execSync(`bash ${WORKSPACE}/post-rebuild.sh`, { timeout: 300000 });
      log('Ingestion check complete');
    } catch (e) {
      log(`ERROR in post-rebuild.sh: ${e.message}`);
    }

    log('Rebuild complete!');
  });
});

server.listen(PORT, () => {
  log(`Webhook server listening on port ${PORT}`);
});
