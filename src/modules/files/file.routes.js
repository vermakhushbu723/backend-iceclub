import { Router } from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import multer from 'multer';
import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { config } from '../../config/index.js';
import { MODELS } from '../../middleware/auth.js';
import { ApiError, str } from '../../utils/http.js';

export const files = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxUploadBytes, files: 1 } });

const bucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });

/** The file's own first bytes decide its type, not what the client claims. */
function sniffType(buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  if (buffer.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  return null;
}

async function anyAccount(req, _res, next) {
  const token = /^Bearer (.+)$/.exec(req.get('authorization') ?? '')?.[1];
  let claims;
  try {
    claims = jwt.verify(token ?? '', config.jwtSecret, { algorithms: ['HS256'] });
  } catch {
    throw new ApiError(401, 'Please sign in again');
  }
  const account = await MODELS[claims.role]?.findById(claims.sub).lean();
  if (!account || account.deletedAt || (account.tokenVersion ?? 0) !== claims.v) throw new ApiError(401, 'Please sign in again');
  req.user = account;
  req.role = claims.role;
  next();
}

files.post('/uploads', anyAccount, upload.single('file'), async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Choose a file to upload');
  const contentType = sniffType(req.file.buffer);
  if (!contentType) throw new ApiError(400, 'Only JPEG, PNG, WebP and PDF files can be uploaded');
  const name = `${randomBytes(24).toString('hex')}`;
  await new Promise((resolve, reject) => {
    const stream = bucket().openUploadStream(name, { metadata: { contentType, ownerType: req.role, ownerId: req.user._id } });
    Readable.from(req.file.buffer).pipe(stream).on('finish', resolve).on('error', reject);
  });
  const path = `/api/files/${name}`;
  res.json({ path, url: `${req.protocol}://${req.get('host')}${path}` });
});

/** The long random name is the key: images in the panel and apps can't send a login header. */
files.get('/files/:name', async (req, res) => {
  const name = str(req.params.name, 60);
  const [file] = await bucket().find({ filename: name }).limit(1).toArray();
  if (!file) throw new ApiError(404, 'File not found');
  res.set({ 'Content-Type': file.metadata?.contentType ?? 'application/octet-stream', 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline', 'Cross-Origin-Resource-Policy': 'cross-origin' });
  bucket().openDownloadStreamByName(name).on('error', () => res.destroy()).pipe(res);
});
