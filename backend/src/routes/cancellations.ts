import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';

const router = Router();

export type ReasonCode =
  | 'CONTRIBUTOR_WITHDREW'
  | 'MAINTAINER_REVOKED'
  | 'TTL_EXPIRED'
  | 'ADMIN_CANCELLED';

// POST / (create cancellation audit entry)
router.post('/', async (req: Request, res: Response) => {
  const body = req.body;
  const required = ['network', 'contractId', 'subscriberAddress', 'merchantAddress', 'ledger', 'transactionHash'];
  for (const f of required) {
    if (!Object.prototype.hasOwnProperty.call(body, f)) {
      return res.status(400).json({ error: `${f} is required` });
    }
  }

  const network = body.network as string;
  const contractId = body.contractId as string;
  const subscriberAddress = body.subscriberAddress as string;
  const merchantAddress = body.merchantAddress as string;
  const tokenAddress = (body.tokenAddress as string) ?? null;
  const amount = (body.amount as string) ?? null;
  const intervalSeconds = body.intervalSeconds ?? null;
  const nextPaymentAt = body.nextPaymentAt ?? null;
  const ledger = BigInt(body.ledger);
  const transactionHash = body.transactionHash as string;
  const reason = (body.reason as string) ?? null;
  const reasonCode = (body.reasonCode as ReasonCode) ?? null;

  try {
    // Insert idempotently using ON CONFLICT (network, transaction_hash)
    const result: any = await prisma.$queryRaw`
      INSERT INTO subscription_cancellations (
        id, network, contract_id, subscriber_address, merchant_address,
        token_address, amount, interval_seconds, next_payment_at,
        ledger, transaction_hash, reason, reason_code
      )
      VALUES (gen_random_uuid(), ${network}, ${contractId}, ${subscriberAddress}, ${merchantAddress}, ${tokenAddress}, ${amount}, ${intervalSeconds}, ${nextPaymentAt}, ${ledger}, ${transactionHash}, ${reason}, ${reasonCode})
      ON CONFLICT (network, transaction_hash) DO UPDATE
        SET updated_at = now()
      RETURNING id, cancelled_at`;

    // If insert returned rows, take the returned id/cancelled_at
    if (Array.isArray(result) && result.length > 0) {
      const row = result[0];
      return res.status(201).json({ id: row.id, cancelledAt: row.cancelled_at ?? row.cancelledAt });
    }

    // Otherwise, fetch existing row
    const existing: any = await prisma.$queryRaw`
      SELECT id, cancelled_at FROM subscription_cancellations
      WHERE network = ${network} AND transaction_hash = ${transactionHash}`;

    if (Array.isArray(existing) && existing.length > 0) {
      return res.status(200).json({ id: existing[0].id, cancelledAt: existing[0].cancelled_at ?? existing[0].cancelledAt });
    }

    // Fallback
    return res.status(500).json({ error: 'Failed to create or fetch cancellation audit entry' });
  } catch (err) {
    console.error('[cancellations POST] error:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

// GET /:merchantAddress/cancellations — list cancellations for a merchant
router.get('/:merchantAddress/cancellations', async (req: Request, res: Response) => {
  const merchantAddress = req.params.merchantAddress as string;
  const network = (req.query.network as string) ?? null;
  const limit = Math.min(parseInt((req.query.limit as string) ?? '50', 10), 100);
  const cursor = (req.query.cursor as string) ?? null;

  try {
    let rows: any[];
    if (cursor) {
      rows = await prisma.$queryRaw`
        SELECT * FROM subscription_cancellations
        WHERE merchant_address = ${merchantAddress}
          AND (${network} IS NULL OR network = ${network})
          AND cancelled_at < ${cursor}
        ORDER BY cancelled_at DESC
        LIMIT ${limit}`;
    } else {
      rows = await prisma.$queryRaw`
        SELECT * FROM subscription_cancellations
        WHERE merchant_address = ${merchantAddress}
          AND (${network} IS NULL OR network = ${network})
        ORDER BY cancelled_at DESC
        LIMIT ${limit}`;
    }

    const items = rows.map((r) => ({
      id: r.id,
      network: r.network,
      contractId: r.contract_id,
      subscriberAddress: r.subscriber_address,
      merchantAddress: r.merchant_address,
      tokenAddress: r.token_address,
      amount: r.amount,
      intervalSeconds: r.interval_seconds,
      nextPaymentAt: r.next_payment_at,
      cancelledAt: r.cancelled_at,
      ledger: r.ledger,
      transactionHash: r.transaction_hash,
      reason: r.reason,
      reasonCode: r.reason_code,
    }));

    res.json({ items, nextCursor: items.length === limit ? items[items.length - 1].cancelledAt : null });
  } catch (err) {
    console.error('[cancellations GET] error:', err);
    res.status(500).json({ error: 'Failed to fetch cancellations' });
  }
});

export default router;
