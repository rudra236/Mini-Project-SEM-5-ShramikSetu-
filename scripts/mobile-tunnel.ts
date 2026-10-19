/**
 * Mobile LAN & HTTPS Tunnel Helper
 *
 * Automatically detects LAN IP or creates an instant public HTTPS tunnel
 * via localtunnel, renders terminal QR code, and enables live camera access
 * on mobile phones (iOS Safari & Android Chrome).
 */

import os from 'os';
import QRCode from 'qrcode';
import { spawn } from 'child_process';

function getLocalIp(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

async function renderTerminalQr(url: string) {
  try {
    const qrTerminal = await QRCode.toString(url, { type: 'terminal', small: true });
    console.log(qrTerminal);
  } catch {
    console.log(`URL: ${url}`);
  }
}

async function startHttpsTunnel(port: number | string) {
  console.log('\n============================================================');
  console.log('       SHRAMIKSETU LIVE HTTPS CAMERA TUNNEL ACTIVATION      ');
  console.log('============================================================\n');
  console.log(`Connecting local port ${port} to public HTTPS gateway...`);

  const lt = spawn('npx', ['--yes', 'localtunnel', '--port', String(port)], {
    shell: true,
  });

  let captured = false;

  lt.stdout.on('data', async (data) => {
    const text = data.toString();
    const match = text.match(/https:\/\/[^\s]+/);
    if (match && !captured) {
      captured = true;
      const httpsUrl = match[0];
      console.log('\n------------------------------------------------------------');
      console.log(`✅ LIVE HTTPS DEV URL : ${httpsUrl}`);
      console.log('📱 Mobile camera permissions are ACTIVE over this HTTPS link.');
      console.log('------------------------------------------------------------\n');
      console.log('Scan this terminal QR code with your phone camera:');
      await renderTerminalQr(httpsUrl);
      console.log('============================================================');
      console.log(`Open in mobile phone: ${httpsUrl}`);
      console.log('Press Ctrl+C to stop the tunnel.\n');
    }
  });

  lt.stderr.on('data', (data) => {
    // ignore non-fatal tunnel logs
  });

  return new Promise<void>((resolve, reject) => {
    lt.on('close', (code) => {
      console.log(`Tunnel closed with exit code ${code}`);
      resolve();
    });
    lt.on('error', (err) => {
      console.error('Tunnel error:', err);
      reject(err);
    });
  });
}

async function main() {
  const port = process.env.PORT || 3000;
  const isTunnelRequested = process.argv.includes('--tunnel') || process.env.TUNNEL === 'true';

  if (isTunnelRequested) {
    await startHttpsTunnel(port);
    return;
  }

  const ip = getLocalIp();
  const lanUrl = `http://${ip}:${port}`;

  console.log('\n============================================================');
  console.log('       SHRAMIKSETU MOBILE LAN & HTTPS ACCESS KIT           ');
  console.log('============================================================\n');

  console.log(`Local Machine URL : http://localhost:${port}`);
  console.log(`LAN Network URL   : ${lanUrl}`);
  console.log('\nScan this QR code with your phone camera to open on local Wi-Fi:');
  await renderTerminalQr(lanUrl);

  console.log('------------------------------------------------------------');
  console.log('📌 NOTE FOR MOBILE LIVE CAMERA / QR SCANNING:');
  console.log('Modern mobile browsers (iOS Safari & Android Chrome) require');
  console.log('HTTPS for navigator.mediaDevices.getUserMedia camera access.');
  console.log('');
  console.log('To start an instant public HTTPS tunnel with terminal QR:');
  console.log('👉 Run: npm run tunnel');
  console.log('============================================================\n');
}

main().catch(console.error);
