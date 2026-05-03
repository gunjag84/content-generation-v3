// Phase 4a approval-success ledger.
// Snapshots editRatioBefore on approve, then tracks editRatioAfter over the
// next APPROVAL_LEDGER_WINDOW publishes. Finalizes with a hurtful flag when
// the window closes.

import { FieldValue } from 'firebase-admin/firestore';
import { db } from './firebase.js';
import type { ApprovalEvent } from '../../shared/schemas/approvalEvent.js';
import {
  APPROVAL_BASELINE_WINDOW,
  APPROVAL_LEDGER_WINDOW,
  APPROVAL_HURTFUL_DELTA,
} from './learningConfig.js';

// Compute the avg totalEditRatio over the most recent N published posts that
// have editStats. Returns null ratio if fewer than 3 such posts exist.
export async function computeBrandEditRatioBaseline(
  uid: string,
  brandId: string,
  windowSize: number,
): Promise<{ ratio: number | null; count: number }> {
  const snap = await db
    .collection(`users/${uid}/brands/${brandId}/posts`)
    .where('status', '==', 'published')
    .orderBy('publishedAt', 'desc')
    .limit(windowSize * 3) // over-fetch to find N with editStats
    .get();

  const ratios: number[] = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    const totalEditRatio = data?.editStats?.totalEditRatio;
    if (typeof totalEditRatio === 'number') {
      ratios.push(totalEditRatio);
      if (ratios.length >= windowSize) break;
    }
  }

  if (ratios.length < 3) return { ratio: null, count: ratios.length };
  const avg = ratios.reduce((sum, r) => sum + r, 0) / ratios.length;
  return { ratio: avg, count: ratios.length };
}

// Called from patterns.ts approve handler after the brand identity is updated.
// Writes a new approvalEvent doc with editRatioBefore captured as a snapshot.
export async function recordApproval(input: {
  uid: string;
  brandId: string;
  patternId: string;
  patternDescription: string;
  zone: 'hook' | 'body' | 'cta' | 'caption';
  target: 'voice' | 'persona';
  mergedText: string;
}): Promise<void> {
  const { uid, brandId, patternId, patternDescription, zone, target, mergedText } = input;

  const { ratio, count } = await computeBrandEditRatioBaseline(
    uid,
    brandId,
    APPROVAL_BASELINE_WINDOW,
  );

  const event: Omit<ApprovalEvent, 'createdAt' | 'finalizedAt'> & {
    createdAt: FirebaseFirestore.FieldValue;
    finalizedAt: null;
  } = {
    patternId,
    patternDescription,
    zone,
    target,
    mergedText,
    editRatioBefore: ratio,
    publishCountBefore: count,
    editRatioAfter: null,
    publishCountAfter: 0,
    deltaEditRatio: null,
    hurtful: false,
    createdAt: FieldValue.serverTimestamp(),
    finalizedAt: null,
  };

  await db
    .collection(`users/${uid}/brands/${brandId}/approvalEvents`)
    .add(event);
}

// Called from learningExtractor on every publish AFTER editStats is written.
// Loads all non-finalized approvalEvents for the brand. For each, increments
// publishCountAfter, updates editRatioAfter (running avg), recomputes delta.
// When publishCountAfter reaches APPROVAL_LEDGER_WINDOW, sets finalizedAt and
// hurtful flag.
export async function updateApprovalLedgerForPublish(input: {
  uid: string;
  brandId: string;
  postEditRatio: number;
}): Promise<void> {
  const { uid, brandId, postEditRatio } = input;

  const snap = await db
    .collection(`users/${uid}/brands/${brandId}/approvalEvents`)
    .where('finalizedAt', '==', null)
    .limit(50)
    .get();

  if (snap.empty) return;

  const batch = db.batch();

  for (const doc of snap.docs) {
    const event = doc.data() as ApprovalEvent;

    // Skip events with no baseline - no point tracking delta.
    if (event.editRatioBefore === null) continue;

    const prevCount = event.publishCountAfter ?? 0;
    const newCount = prevCount + 1;

    // Running average: (prev_avg * prev_count + new_ratio) / new_count
    const prevAvg = event.editRatioAfter ?? 0;
    const newAvg = (prevAvg * prevCount + postEditRatio) / newCount;
    const delta = newAvg - event.editRatioBefore;

    const update: Record<string, unknown> = {
      publishCountAfter: newCount,
      editRatioAfter: newAvg,
      deltaEditRatio: delta,
    };

    if (newCount >= APPROVAL_LEDGER_WINDOW) {
      update.finalizedAt = FieldValue.serverTimestamp();
      update.hurtful = delta > APPROVAL_HURTFUL_DELTA;
    }

    batch.update(doc.ref, update);
  }

  await batch.commit();
}
