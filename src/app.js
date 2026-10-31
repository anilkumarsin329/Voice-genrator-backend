const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const config = require('./config');
const logger = require('./utils/logger');
const limits = require('./middleware/rateLimit');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/error');

const app = express();
if (config.trustProxy) app.set('trust proxy', config.trustProxy);

// CLIENT_ORIGIN entries may use `*` as a wildcard, e.g. https://voice-genrator-*.vercel.app for Vercel preview URLs.
const originMatchers = config.clientOrigins.map((o) => new RegExp(`^${o.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[a-z0-9-]+')}$`, 'i'));
const isAllowedOrigin = (origin) => !origin || originMatchers.some((re) => re.test(origin));

app.use(helmet());
app.use(
  cors({
    origin: (origin, cb) => {
      if (!isAllowedOrigin(origin)) logger.warn('CORS blocked origin', { origin });
      cb(null, isAllowedOrigin(origin));
    },
    credentials: false,
  })
);
app.use(compression());
app.use(morgan(':method :url :status :res[content-length] - :response-time ms', { stream: logger.stream }));
app.use(express.json({ limit: '1mb' }));

app.use('/api', limits.api, routes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
