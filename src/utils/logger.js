const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, '..', '..', 'logs');
try { fs.mkdirSync(logDir, { recursive: true }); } catch { /* ignore */ }
const file = path.join(logDir, 'app.log');

const write = (level, msg, meta) => {
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...(meta || {}) });
  (level === 'error' ? console.error : console.log)(line);
  fs.appendFile(file, line + '\n', () => {});
};

module.exports = {
  info: (m, meta) => write('info', m, meta),
  warn: (m, meta) => write('warn', m, meta),
  error: (m, meta) => write('error', m, meta),
  stream: { write: (s) => write('http', s.trim()) },
};
