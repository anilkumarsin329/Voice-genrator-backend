const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const config = require('../config');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

// No credentials are passed explicitly: the SDK default provider chain resolves them
// (EC2 instance profile / IAM role in production, env vars or shared profile locally).
const client = new S3Client({ region: config.aws.region, maxAttempts: 3 });
const { bucket, prefix, presignTtl } = config.aws;

const withPrefix = (key) => (prefix ? `${prefix}/${key}` : key);

const upload = async (key, body, contentType = 'audio/mpeg') => {
  try {
    await client.send(
      new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType, ServerSideEncryption: 'AES256' })
    );
  } catch (err) {
    logger.error('s3 upload failed', { key, error: err.message });
    throw new ApiError(502, `Failed to store audio in S3: ${err.message}`, 'S3_UPLOAD_FAILED');
  }
};

const remove = async (key) => {
  if (!key) return;
  try {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch (err) {
    logger.error('s3 delete failed', { key, error: err.message });
    throw new ApiError(502, `Failed to delete audio from S3: ${err.message}`, 'S3_DELETE_FAILED');
  }
};

/** Presigned GET URL. `filename` forces a download with that name instead of inline playback. */
const presignedUrl = (key, { filename } = {}) =>
  getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentType: 'audio/mpeg',
      ...(filename ? { ResponseContentDisposition: `attachment; filename="${filename.replace(/[^\w.\-]/g, '_')}"` } : {}),
    }),
    { expiresIn: presignTtl }
  );

module.exports = { upload, remove, presignedUrl, withPrefix };
