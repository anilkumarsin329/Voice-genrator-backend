const { S3Client, PutObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
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
const presignedUrl = (key, { filename, contentType = 'audio/mpeg' } = {}) =>
  getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentType: contentType,
      ...(filename ? { ResponseContentDisposition: `attachment; filename="${filename.replace(/[^\w.\-]/g, '_')}"` } : {}),
    }),
    { expiresIn: presignTtl }
  );

/** Download an object fully into memory (used to feed a previous image back into an edit). */
const getBuffer = async (key) => {
  try {
    const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return Buffer.from(await out.Body.transformToByteArray());
  } catch (err) {
    logger.error('s3 get failed', { key, error: err.message });
    throw new ApiError(502, `Failed to read file from S3: ${err.message}`, 'S3_READ_FAILED');
  }
};

/** Best-effort bulk delete (max 1000 keys per call). Returns how many keys failed. */
const removeMany = async (keys) => {
  let failed = 0;
  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000);
    try {
      const out = await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true } }));
      failed += out.Errors?.length || 0;
    } catch (err) {
      logger.error('s3 bulk delete failed', { error: err.message });
      failed += chunk.length;
    }
  }
  return failed;
};

module.exports = { upload, remove, removeMany, getBuffer, presignedUrl, withPrefix };
