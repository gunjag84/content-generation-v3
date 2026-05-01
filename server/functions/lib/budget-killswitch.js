"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.budgetKillswitch = void 0;
const pubsub_1 = require("firebase-functions/v2/pubsub");
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
if ((0, app_1.getApps)().length === 0)
    (0, app_1.initializeApp)();
exports.budgetKillswitch = (0, pubsub_1.onMessagePublished)({ topic: 'budget-alerts', region: 'europe-west1' }, async (event) => {
    const data = (event.data.message.json ?? {});
    const cost = typeof data.costAmount === 'number' ? data.costAmount : null;
    const budget = typeof data.budgetAmount === 'number' ? data.budgetAmount : null;
    // Trip when cost has reached 100% of the $40 budget.
    if (cost !== null && budget !== null && cost >= budget) {
        await (0, firestore_1.getFirestore)().doc('system/killSwitch').set({ enabled: false }, { merge: true });
        console.warn('budget-killswitch tripped: enabled=false', { cost, budget });
    }
    else {
        console.log('budget-killswitch received non-trip alert', { cost, budget, threshold: data.alertThresholdExceeded });
    }
});
