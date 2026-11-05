export const assetPath = (image) => `assets/images/${image}`;

/** Makes a stored path into a full URL, so the apps and admin panel can load it from anywhere. */
export const fileUrl = (req, path) => (path?.startsWith('/api/') ? `${req.protocol}://${req.get('host')}${path}` : path);
