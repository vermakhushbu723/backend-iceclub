import { Attendance, FuelTopUp, Handover, Rider, SalaryPayment } from '../../../models/index.js';
import { cashHeld } from '../admin.helpers.js';
import { ACCOUNTS, DISPATCH } from '../admin.roles.js';
import { riderRow } from '../admin.views.js';
import { logActivity, notify } from '../../../services/notification.service.js';
import { checkNewPassword, hashPassword } from '../../../services/password.service.js';
import { dayKey } from '../../../utils/dates.js';
import { fileUrl } from '../../../utils/urls.js';
import { amount, bool, doc, need, newId, notFound, num, phoneOf, str } from '../../../utils/http.js';

export const riderActions = {
  /** Staff watch the rider's video from the pump, then approve or reject the fuel top-up. */
  decideFuelTopUp: [[...ACCOUNTS, ...DISPATCH], async (req, id, approve, remark) => {
    const row = await FuelTopUp.findById(str(id, 60));
    if (!row) throw notFound('Fuel top-up');
    need(row.status === 'pending', 'This top-up has already been decided');
    const reason = str(remark, 300);
    need(bool(approve) || reason, 'Enter why it is rejected');
    row.status = bool(approve) ? 'approved' : 'rejected';
    row.remark = reason;
    row.decidedBy = req.user.name ?? req.user.email ?? '';
    row.decidedAt = new Date();
    await row.save();
    await notify('rider', await Rider.findById(row.riderId).lean(), 'payment', bool(approve) ? 'Fuel top-up approved' : 'Fuel top-up rejected', bool(approve) ? `Your fuel of ₹${row.amount} (${row.litres} L) was approved.` : `Your fuel of ₹${row.amount} was rejected: ${reason}`);
    await logActivity(`Fuel top-up of ${row.riderName} ${row.status}`, bool(approve) ? 'green' : 'red');
    return { fuelTopUps: [{ ...doc(row.toObject()), video: fileUrl(req, row.video) }] };
  }],

  saveRider: [DISPATCH, async (req, values) => {
    const name = str(values?.name, 80);
    need(name, 'Enter the rider name');
    const phone = phoneOf(values.phone);
    const id = str(values.id, 60);
    const duplicate = await Rider.findOne({ phone, _id: { $ne: id }, deletedAt: null }).lean();
    need(!duplicate, `This mobile number already belongs to ${duplicate?.name}`);
    const fields = { name, phone, vehicleType: str(values.vehicleType, 40), vehicleNumber: str(values.vehicleNumber, 20), licence: str(values.licence, 30), zone: str(values.zone, 60), factoryId: str(values.factoryId, 60), salary: Math.max(0, num(values.salary) || 0) };
    if (values.active != null) fields.active = bool(values.active);
    if (values.onDuty != null) fields.onDuty = bool(values.onDuty);
    if (values.password) fields.passwordHash = await hashPassword(checkNewPassword(values.password));
    const riderId = id || newId('R');
    if (id) await Rider.updateOne({ _id: id }, fields);
    else {
      await Rider.create([{ _id: riderId, joinedOn: new Date(), ...fields }], {});
      await logActivity(`Rider ${name} added`);
    }
    return { riders: [riderRow(req, await Rider.findById(riderId).lean())] };
  }],

  checkInRider: [DISPATCH, async (req, riderId) => {
    const id = str(riderId, 60);
    const day = dayKey();
    need(await Rider.exists({ _id: id }), 'Select a rider');
    need(!(await Attendance.exists({ riderId: id, day })), 'This rider has already checked in today');
    const [row] = await Attendance.create([{ _id: newId('A'), riderId: id, day, checkIn: new Date() }], {});
    return { attendance: [doc(row.toObject())] };
  }],

  checkOutRider: [DISPATCH, async (req, attendanceId) => {
    const row = await Attendance.findById(str(attendanceId, 60));
    if (!row) throw notFound('Attendance');
    need(!row.checkOut, 'This rider has already checked out');
    row.checkOut = new Date();
    await row.save();
    return { attendance: [doc(row.toObject())] };
  }],

  recordHandover: [ACCOUNTS, async (req, riderId, value, ref) => {
    const id = str(riderId, 60);
    const money = amount(value);
    const reference = str(ref, 80);
    need(reference, 'Enter the receipt or slip number');
    await Rider.updateOne({ _id: id }, { $inc: { rev: 1 } });
    const inHand = await cashHeld(id);
    need(money <= inHand, `This rider only has ₹${inHand} in hand`);
    const [row] = await Handover.create([{ _id: newId('H'), riderId: id, amount: money, at: new Date(), ref: reference, receivedBy: req.user.name, status: 'confirmed' }], {});
    await logActivity(`Cash handover received: ₹${money}`, 'green');
    return { handovers: [doc(row.toObject())] };
  }],

  decideHandover: [ACCOUNTS, async (req, id, approve) => {
    const row = await Handover.findById(str(id, 60));
    if (!row) throw notFound('Handover');
    need(row.status === 'pending', 'This deposit has already been decided');
    row.status = approve ? 'confirmed' : 'rejected';
    row.receivedBy = req.user.name;
    await row.save();
    await notify('rider', row.riderId, 'payment', approve ? 'Deposit confirmed' : 'Deposit rejected', `₹${row.amount} (ref. ${row.ref}) was ${approve ? 'confirmed' : 'rejected'}.`);
    await logActivity(`Cash deposit ${approve ? 'confirmed' : 'rejected'}: ₹${row.amount}`, approve ? 'green' : 'red');
    return { handovers: [doc(row.toObject())] };
  }],

  paySalary: [ACCOUNTS, async (req, riderId, month, value, deductions = 0, bonus = 0) => {
    const id = str(riderId, 60);
    const key = str(month, 7);
    need(/^\d{4}-\d{2}$/.test(key), 'Select a month');
    need(await Rider.exists({ _id: id }), 'Select a rider');
    need(!(await SalaryPayment.exists({ riderId: id, month: key })), 'This month has already been paid');
    const [row] = await SalaryPayment.create([{ _id: newId('SP'), riderId: id, month: key, amount: amount(value), deductions: Math.max(0, num(deductions) || 0), bonus: Math.max(0, num(bonus) || 0), paidOn: new Date() }], {});
    await notify('rider', id, 'payment', 'Salary paid', `Your salary for ${key} has been paid.`);
    return { salaryPayments: [doc(row.toObject())] };
  }],
};
