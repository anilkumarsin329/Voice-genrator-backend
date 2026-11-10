const router = require('express').Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const validate = require('../middleware/validate');
const limits = require('../middleware/rateLimit');
const s = require('../validators/schemas');
const auth = require('../controllers/auth.controller');
const voice = require('../controllers/voice.controller');
const voiceConfig = require('../controllers/voiceConfig.controller');
const scripture = require('../controllers/scripture.controller');
const image = require('../controllers/image.controller');

router.get('/health', (req, res) => res.json({ success: true, status: 'ok', time: new Date().toISOString() }));

/* ---- auth ---- */
router.post('/auth/login', limits.login, validate(s.login), auth.login);
router.get('/auth/me', authenticate, auth.me);

/* ---- everything below: admin only ---- */
const admin = [authenticate, requireAdmin];

/* ---- scripture (read-only view of the platform ramayanas / ramayanaverses) ---- */
router.get('/admin/scripture/kandas', admin, scripture.kandas);
router.get('/admin/scripture/kandas/:id/sargas', admin, validate(s.idParam, 'params'), scripture.sargas);
router.get('/admin/scripture/kandas/:id/verses', admin, validate(s.idParam, 'params'), validate(s.scriptureVerses, 'query'), scripture.verses);

/* ---- image generation ---- */
const im = '/admin/image';
router.get(`${im}/options`, admin, image.options);
router.post(`${im}/generate`, admin, limits.generate, validate(s.imageGenerate), image.generate);
router.get(`${im}/chats`, admin, validate(s.imageChatList, 'query'), image.listChats);
router.get(`${im}/chats/:id`, admin, validate(s.idParam, 'params'), image.getChat);
router.patch(`${im}/chats/:id`, admin, validate(s.idParam, 'params'), validate(s.imageChatRename), image.renameChat);
router.delete(`${im}/chats/:id`, admin, validate(s.idParam, 'params'), image.removeChat);
router.post(`${im}/generations/:id/animate`, admin, limits.generate, validate(s.idParam, 'params'), validate(s.imageAnimate), image.animate);
router.delete(`${im}/generations/:id`, admin, validate(s.idParam, 'params'), image.removeGeneration);

/* ---- voice ---- (static paths are declared before /:id) */
const v = '/admin/voice';
router.post(`${v}/generate`, admin, limits.generate, validate(s.generate), voice.generate);
router.get(`${v}/history`, admin, validate(s.history, 'query'), voice.history);
router.get(`${v}/usage`, admin, voice.usage);

router.get(`${v}/voices`, admin, voiceConfig.list);
router.post(`${v}/voices/test`, admin, limits.generate, validate(s.voiceTest), voiceConfig.test);
router.patch(`${v}/voices/:voiceId`, admin, validate(s.voiceIdParam, 'params'), validate(s.voiceConfigUpdate), voiceConfig.update);

router.post(`${v}/bulk-generate`, admin, limits.generate, validate(s.bulkGenerate), voice.bulkGenerate);
router.get(`${v}/bulk/latest`, admin, voice.bulkLatest);
router.get(`${v}/bulk/:id`, admin, validate(s.idParam, 'params'), voice.bulkStatus);
router.post(`${v}/bulk/:id/retry`, admin, limits.generate, validate(s.idParam, 'params'), voice.bulkRetry);

router.get(`${v}/:id`, admin, validate(s.idParam, 'params'), voice.getOne);
router.delete(`${v}/:id`, admin, validate(s.idParam, 'params'), voice.remove);
router.post(`${v}/:id/regenerate`, admin, limits.generate, validate(s.idParam, 'params'), validate(s.regenerate), voice.regenerate);
router.post(`${v}/:id/save`, admin, validate(s.idParam, 'params'), voice.save);

module.exports = router;
