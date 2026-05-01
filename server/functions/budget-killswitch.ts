import { onMessagePublished } from 'firebase-functions/v2/pubsub';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) initializeApp();

interface BudgetAlertMessage {
  costAmount?: number;
  budgetAmount?: number;
  costIntervalStart?: string;
  alertThresholdExceeded?: number;
}

export const budgetKillswitch = onMessagePublished(
  { topic: 'budget-alerts', region: 'europe-west1' },
  async (event) => {
    const data = (event.data.message.json ?? {}) as BudgetAlertMessage;
    const cost = typeof data.costAmount === 'number' ? data.costAmount : null;
    const budget = typeof data.budgetAmount === 'number' ? data.budgetAmount : null;
    // Trip when cost has reached 100% of the $40 budget.
    if (cost !== null && budget !== null && cost >= budget) {
      await getFirestore().doc('system/killSwitch').set({ enabled: false }, { merge: true });
      console.warn('budget-killswitch tripped: enabled=false', { cost, budget });
    } else {
      console.log('budget-killswitch received non-trip alert', { cost, budget, threshold: data.alertThresholdExceeded });
    }
  }
);
