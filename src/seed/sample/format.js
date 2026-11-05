import dayjs from 'dayjs';

const whole = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const exact = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });

export const round2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;

/** ₹1,20,000 for whole amounts, ₹1,20,000.50 otherwise. */
export const money = (v = 0) => (Number.isInteger(round2(v)) ? whole : exact).format(round2(v));

/** ₹1.25 L for dashboards. */
export const moneyShort = (v = 0) => {
  const abs = Math.abs(v);
  if (abs >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`;
  return whole.format(Math.round(v));
};

export const tons = (kg = 0) => `${(kg / 1000).toFixed(1)} T`;

export const fmtDate = (d) => (d ? dayjs(d).format('D MMM YYYY') : '-');
export const fmtDateTime = (d) => (d ? dayjs(d).format('D MMM YYYY, h:mm A') : '-');
export const fmtTime = (d) => (d ? dayjs(d).format('h:mm A') : '-');
export const fmtDay = (d) => dayjs(d).format('ddd D MMM');

export const hoursBetween = (a, b) => (a && b ? round2(dayjs(b).diff(dayjs(a), 'minute') / 60) : 0);

/** Downloads rows as a CSV that Excel opens correctly. */
export function downloadCsv(filename, headers, rows) {
  const cell = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
  const text = [headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([`﻿${text}`], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
