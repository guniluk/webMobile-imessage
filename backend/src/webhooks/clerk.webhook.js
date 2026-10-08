import express from 'express';
import User from '../models/user.model.js';
import { verifyWebhook } from '@clerk/backend/webhooks';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const signingSecret =
      process.env.CLERK_WEBHOOK_SIGNING_SECRET ||
      process.env.CLERK_WEBHOOK_SECRET;
    if (!signingSecret) {
      console.error('Missing webhook signing secret');
      return res.status(503).json({ error: 'webhook signing secret missing' });
    }

    //clerk's verifier expects a web request with the raw body : express.raw gives a buffer
    const payload = Buffer.isBuffer(req.body)
      ? req.body.toString('utf-8')
      : String(req.body);

    const request = new Request('http://internal/webhooks/clerk', {
      method: 'POST',
      headers: new Headers(req.headers),
      body: payload,
    });

    const evt = await verifyWebhook(request, { signingSecret });
    console.log(`[Clerk Webhook] Received event: ${evt.type}`);

    if (evt.type === 'user.created' || evt.type === 'user.updated') {
      const u = evt.data;
      const email =
        u.email_addresses?.find((e) => e.id === u.primary_email_address_id)
          ?.email_address ?? u.email_addresses?.[0]?.email_address;
      if (!email) {
        console.warn(`[Clerk Webhook] User has no email address (Clerk ID: ${u.id})`);
        return res.status(400).json({ error: 'User has no email address' });
      }
      const fullName =
        [u.first_name, u.last_name].filter(Boolean).join(' ') ||
        u.username ||
        email.split('@')[0];

      const profilePic = u.image_url || '';

      const updatedUser = await User.findOneAndUpdate(
        { clerkId: u.id },
        {
          clerkId: u.id,
          email,
          fullName,
          profilePic,
        },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
      );
      console.log(`[Clerk Webhook] ✅ MongoDB sync success for user: ${updatedUser._id} (${fullName})`);
    }

    if (evt.type === 'user.deleted') {
      if (evt.data.id) {
        await User.deleteOne({ clerkId: evt.data.id });
        console.log(`[Clerk Webhook] 🗑️ User deleted from MongoDB: ${evt.data.id}`);
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('[Clerk Webhook] ❌ Webhook error:', error.message || error);
    res.status(400).json({ message: 'Webhook verification failed', error: error.message });
  }
});

export default router;
