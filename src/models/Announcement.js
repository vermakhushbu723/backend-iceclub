import { define } from './base.js';

export const Announcement = define('Announcement', { audience: String, title: String, body: String, at: Date });
