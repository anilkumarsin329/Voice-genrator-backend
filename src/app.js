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

app.use(helmet());
app.use(
  cors({
    origin: (origin, cb) => cb(null, !origin || config.clientOrigins.includes(origin)),
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
