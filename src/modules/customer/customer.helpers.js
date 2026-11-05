import { Customer } from '../../models/index.js';

export const fresh = (req) => Customer.findById(req.user._id).lean();
