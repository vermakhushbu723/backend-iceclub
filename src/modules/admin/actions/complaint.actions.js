import { ACCOUNTS, DISPATCH } from '../admin.roles.js';
import { Complaint } from '../../../models/index.js';
import { adminComplaint } from '../admin.views.js';
import { decideComplaint } from '../../../services/complaint.service.js';
import { bool, notFound, str } from '../../../utils/http.js';

export const complaintActions = {
  decideComplaint: [[...ACCOUNTS, ...DISPATCH], async (req, id, approve, remark, creditAmount) => {
    const complaint = await Complaint.findById(str(id, 60));
    if (!complaint) throw notFound('Complaint');
    await decideComplaint(complaint, bool(approve), remark, creditAmount);
    return { complaints: [adminComplaint(req, complaint.toObject())] };
  }],
};
