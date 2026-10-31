// Creates (or resets) a Voice Studio admin in this module's own `voicegen_admins` collection.
//   node scripts/create-admin.js [email]
// A random password is generated and written to backend/.env as TEST_EMAIL / TEST_PASSWORD.
// It is never printed.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const config = require('../src/config');
const VoiceAdmin = require('../src/models/VoiceAdmin');

(async () => {
  const email = (process.argv[2] || 'admin@voicestudio.test').toLowerCase();
  const password = crypto.randomBytes(12).toString('base64url');
  await mongoose.connect(config.mongoUri);
  await VoiceAdmin.findOneAndUpdate(
    { email },
    { email, password: await bcrypt.hash(password, 12), role: 'admin', isActive: true, loginApproved: true },
    { upsert: true }
  );
  await mongoose.disconnect();

  const envPath = path.join(__dirname, '..', '.env');
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/).filter((l) => !/^(TEST_EMAIL|TEST_PASSWORD)=/.test(l));
  lines.push(`TEST_EMAIL=${email}`, `TEST_PASSWORD=${password}`);
  fs.writeFileSync(envPath, lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n');
  console.log(`Admin ready: ${email} (password saved to backend/.env as TEST_PASSWORD)`);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
