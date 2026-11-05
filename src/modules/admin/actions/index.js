import { dealerActions } from './dealer.actions.js';
import { orderActions } from './order.actions.js';
import { complaintActions } from './complaint.actions.js';
import { riderActions } from './rider.actions.js';
import { factoryActions } from './factory.actions.js';
import { accountActions } from './account.actions.js';
import { productActions } from './product.actions.js';
import { requestActions } from './request.actions.js';
import { notificationActions } from './notification.actions.js';
import { settingsActions } from './settings.actions.js';

/** One action for each button in the panel: [roles allowed, handler]. Each returns the records it changed. */
export const actions = {
  ...dealerActions,
  ...orderActions,
  ...complaintActions,
  ...riderActions,
  ...factoryActions,
  ...accountActions,
  ...productActions,
  ...requestActions,
  ...notificationActions,
  ...settingsActions,
};

export const ACTION_NAMES = [...Object.keys(actions), 'confirmDelivery'];
