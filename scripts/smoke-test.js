// End-to-end smoke test against a RUNNING backend (npm start). Hits real ElevenLabs + S3 with a tiny
// text, then deletes everything it created.
//   node scripts/smoke-test.js
// Requires TEST_EMAIL / TEST_PASSWORD of an admin account.
const config = require('../src/config');
const jwt = require('jsonwebtoken');

const BASE = process.env.API_URL || `http://localhost:${config.port}/api`;
let token;
let pass = 0;
let fail = 0;

const call = async (method, path, body, { raw = false, auth = true } = {}) => {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(auth && token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (raw) return res;
  const json = await res.json().catch(() => ({}));
  return { ...json, status: res.status };
};

const check = (name, cond, extra = '') => {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + extra}`);
};

(async () => {
  // ---- auth ----
  let r = await call('GET', '/health', null, { auth: false });
  check('GET /health', r.status === 200);
  r = await call('GET', '/admin/voice/history', null, { auth: false });
  check('history without token -> 401', r.status === 401, JSON.stringify(r));
  r = await call('POST', '/auth/login', { email: 'nobody@example.com', password: 'wrong' }, { auth: false });
  check('login with bad credentials -> 401', r.status === 401, JSON.stringify(r));
  r = await call('POST', '/auth/login', { email: 'not-an-email' }, { auth: false });
  check('login validation -> 400', r.status === 400, JSON.stringify(r));

  if (!process.env.TEST_EMAIL || !process.env.TEST_PASSWORD) {
    console.log('\nSet TEST_EMAIL and TEST_PASSWORD (an admin account) to run the authenticated checks.');
    process.exit(1);
  }
  r = await call('POST', '/auth/login', { email: process.env.TEST_EMAIL, password: process.env.TEST_PASSWORD }, { auth: false });
  check('login with real admin', r.status === 200 && r.token, JSON.stringify(r));
  token = r.token;
  r = await call('GET', '/auth/me');
  check('GET /auth/me', r.status === 200 && r.user?.role);
  const forged = jwt.sign({ sub: '000000000000000000000000' }, 'wrong-secret');
  r = await (await fetch(BASE + '/auth/me', { headers: { Authorization: `Bearer ${forged}` } })).json();
  check('forged token rejected', r.success === false);

  // ---- voices ----
  r = await call('GET', '/admin/voice/voices');
  check('GET /voices', r.status === 200 && Array.isArray(r.voices) && r.models?.length, JSON.stringify(r).slice(0, 300));
  console.log(`      ${r.voices?.length} voices${r.warning ? ' | WARNING: ' + r.warning : ''}`);
  const voice = r.voices?.[0];
  if (!voice) { console.log('No voices available, cannot continue'); process.exit(1); }

  r = await call('PATCH', `/admin/voice/voices/${voice.voiceId}`, { style: 'narrator', approved: { english: true } });
  check('PATCH /voices/:id (approve)', r.status === 200 && r.config?.approved?.english === true, JSON.stringify(r));

  const t = await call('POST', '/admin/voice/voices/test', { voiceId: voice.voiceId, language: 'english', text: 'Om namah shivaya.' }, { raw: true });
  const bytes = (await t.arrayBuffer()).byteLength;
  check('POST /voices/test returns mp3', t.status === 200 && t.headers.get('content-type') === 'audio/mpeg' && bytes > 1000, `status ${t.status}`);

  await call("PATCH", `/admin/voice/voices/${voice.voiceId}`, { style: "", approved: { english: false } }); // revert test change

  // ---- validation ----
  r = await call('POST', '/admin/voice/generate', { title: 'x', language: 'klingon', text: 'hi', voiceId: voice.voiceId });
  check('generate rejects bad language', r.status === 400, JSON.stringify(r));
  r = await call('POST', '/admin/voice/generate', { title: 'x', language: 'english', text: '   ', voiceId: voice.voiceId });
  check('generate rejects empty text', r.status === 400, JSON.stringify(r));
  r = await call('GET', '/admin/voice/not-an-id');
  check('GET /:id rejects invalid id', r.status === 400, JSON.stringify(r));

  // ---- generate -> S3 -> presigned url ----
  const payload = {
    title: `Smoke test ${Date.now()}`,
    language: 'english',
    text: `Peace be with you, test ${Date.now()}.`,
    voiceId: voice.voiceId,
    voiceName: voice.name,
    voiceStyle: 'narrator',
    modelId: 'eleven_multilingual_v2',
  };
  r = await call('POST', '/admin/voice/generate', payload);
  check('POST /generate', r.status === 201 && r.audio?.status === 'completed' && r.audio?.playUrl, JSON.stringify(r).slice(0, 400));
  const audio = r.audio;
  if (!audio) { process.exit(1); }
  check('generate: duration + size recorded', audio.duration > 0 && audio.fileSize > 1000, `${audio.duration}s ${audio.fileSize}b`);
  check('generate: s3Key not exposed', audio.s3Key === undefined && !('contentHash' in audio));
  const dl = await fetch(audio.playUrl);
  check('presigned play URL serves audio', dl.status === 200 && (await dl.arrayBuffer()).byteLength === audio.fileSize, `status ${dl.status}`);
  const dl2 = await fetch(audio.downloadUrl);
  check('download URL has attachment disposition', dl2.status === 200 && /attachment/.test(dl2.headers.get('content-disposition') || ''));
  await dl2.arrayBuffer();

  r = await call('POST', '/admin/voice/generate', payload);
  check('duplicate generation returns existing (no new credits)', r.status === 200 && r.duplicate === true && r.audio?.id === audio.id, JSON.stringify(r).slice(0, 200));

  r = await call('POST', `/admin/voice/${audio.id}/save`);
  check('POST /:id/save', r.status === 200 && r.audio?.saved === true, JSON.stringify(r).slice(0, 200));
  r = await call('GET', `/admin/voice/${audio.id}`);
  check('GET /:id', r.status === 200 && r.audio?.id === audio.id && r.audio?.text === payload.text);

  r = await call('GET', `/admin/voice/history?q=${encodeURIComponent('smoke test')}&language=english&limit=5`);
  check('GET /history (search + filter)', r.status === 200 && r.items?.some((i) => i.id === audio.id) && r.pagination?.total >= 1, JSON.stringify(r).slice(0, 300));
  r = await call('GET', '/admin/voice/history?q=.*');
  check('history regex input is escaped', r.status === 200 && r.items.length === 0, JSON.stringify(r).slice(0, 200));

  r = await call('POST', `/admin/voice/${audio.id}/regenerate`, { speed: 0.9 });
  check('POST /:id/regenerate (new settings)', r.status === 200 && r.audio?.status === 'completed' && r.audio?.speed === 0.9, JSON.stringify(r).slice(0, 300));
  const regenerated = r.audio;

  r = await call('GET', '/admin/voice/usage');
  check('GET /usage', r.status === 200 && r.totals?.totalAudio >= 1, JSON.stringify(r).slice(0, 400));
  console.log(`      totals ${JSON.stringify(r.totals)} | elevenlabs quota: ${r.elevenlabs ? `${r.elevenlabs.characterCount}/${r.elevenlabs.characterLimit}` : 'unavailable (key lacks user_read)'}`);

  // ---- scripture + bulk ----
  r = await call('GET', '/admin/scripture/kandas');
  check('GET /scripture/kandas', r.status === 200 && r.kandas?.length > 0, JSON.stringify(r).slice(0, 200));
  const withVerses = r.kandas?.find((k) => k.verseCount > 0);
  if (withVerses) {
    r = await call('GET', `/admin/scripture/kandas/${withVerses.id}/sargas`);
    check('GET /kandas/:id/sargas', r.status === 200 && Array.isArray(r.sargas));
    r = await call('GET', `/admin/scripture/kandas/${withVerses.id}/verses?language=hindi`);
    check('GET /kandas/:id/verses', r.status === 200 && r.verses?.length > 0, JSON.stringify(r).slice(0, 200));
  } else console.log('SKIP  no kanda with verses for bulk test');

  r = await call('POST', '/admin/voice/bulk-generate', { kandaId: 'zz', sargaNumber: 1, verseIds: [], language: 'hindi', voiceId: voice.voiceId });
  check('bulk-generate validation -> 400', r.status === 400);
  r = await call('GET', '/admin/voice/bulk/latest');
  check('GET /bulk/latest', r.status === 200);

  // ---- delete + cleanup ----
  r = await call('DELETE', `/admin/voice/${audio.id}`);
  check('DELETE /:id', r.status === 200, JSON.stringify(r));
  r = await call('GET', `/admin/voice/${audio.id}`);
  check('deleted audio -> 404', r.status === 404);
  check('regenerate kept the same record', regenerated.id === audio.id);
  const gone = await fetch(regenerated.playUrl);
  check('S3 object removed', gone.status === 403 || gone.status === 404, `status ${gone.status}`);
  await gone.arrayBuffer();

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
