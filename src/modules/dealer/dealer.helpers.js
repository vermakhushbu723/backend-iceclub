import { Dealer } from '../../models/index.js';
import { need } from '../../utils/http.js';

export const fresh = (req) => Dealer.findById(req.user._id).lean();

/** Screens that place orders and show prices need an approved account. */
export const approved = (req) => need(req.user.kycStatus === 'approved' && req.user.active, 'Your account has not been approved yet', 403);
