import dayjs from 'dayjs';
import { Router } from 'express';
import { Attendance, Order, SalaryPayment } from '../../../models/index.js';
import { setting } from '../../../services/settings.service.js';
import { read } from '../../../utils/http.js';

const router = Router();

export async function monthlyPay(riderDoc, month, rules) {
  const start = month.startOf('month').toDate();
  const end = month.endOf('month').toDate();
  const present = await Attendance.countDocuments({ riderId: riderDoc._id, checkIn: { $gte: start, $lte: end } });
  const delivered = await Order.countDocuments({ riderId: riderDoc._id, status: 'delivered', 'delivery.at': { $gte: start, $lte: end } });
  const incentives = delivered * rules.perDelivery + (delivered >= rules.monthlyTarget ? rules.targetBonus : 0);
  return { present, delivered, incentives };
}

router.get('/earnings/salaries', read(async (req) => {
  const rules = await setting('riderPay');
  const payments = Object.fromEntries((await SalaryPayment.find({ riderId: req.user._id }).lean()).map((p) => [p.month, p]));
  const rows = [];
  for (let i = 0; i < 4; i += 1) {
    const month = dayjs().subtract(i, 'month');
    const { present, incentives } = await monthlyPay(req.user, month, rules);
    const paid = payments[month.format('YYYY-MM')];
    rows.push({ month: month.startOf('month').toDate(), baseSalary: req.user.salary ?? 0, presentDays: present, workingDays: rules.workingDays, incentives: incentives + (paid?.bonus ?? 0), deductions: paid?.deductions ?? 0, paidOn: paid?.paidOn ?? null });
  }
  return rows;
}));

router.get('/earnings/incentives', read(async (req) => {
  const rules = await setting('riderPay');
  const { delivered } = await monthlyPay(req.user, dayjs(), rules);
  return [
    { title: 'Per delivery', detail: `${delivered} ${delivered === 1 ? 'delivery' : 'deliveries'} this month at ₹${rules.perDelivery} each`, amount: delivered * rules.perDelivery, achieved: true },
    { title: 'Monthly target', detail: `${delivered} of ${rules.monthlyTarget} deliveries`, amount: rules.targetBonus, achieved: delivered >= rules.monthlyTarget },
  ];
}));

export default router;
