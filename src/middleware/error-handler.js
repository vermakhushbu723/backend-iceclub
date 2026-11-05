import { ApiError } from '../utils/http.js';

// Express knows an error handler by its four arguments.
export function errorHandler(error, _req, res, _next) {
  if (error.name === 'MulterError') {
    res.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'That file is too large. The limit is 8 MB.' : 'That file could not be uploaded' });
    return;
  }
  if (error.type === 'entity.too.large' || error.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'That request is not valid' });
    return;
  }
  if (error instanceof ApiError) {
    res.status(error.status).json({ error: error.message, ...error.extra });
    return;
  }
  if (error.code === 11000) {
    res.status(409).json({ error: 'That has already been saved' });
    return;
  }
  if (error.name === 'ValidationError' || error.name === 'CastError') {
    res.status(400).json({ error: 'Some of the details are not valid' });
    return;
  }
  console.error(error);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
}
