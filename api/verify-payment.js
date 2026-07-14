// api/verify-payment.js
// Verifies Razorpay's HMAC signature after checkout, then marks the
// matching order row (found via razorpay_order_id) as paid or failed.

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ verified: false, error: 'Method not allowed' });
  }

  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ verified: false, error: 'Missing payment fields' });
    }
    if (!process.env.RAZORPAY_KEY_SECRET) {
      return res.status(500).json({ verified: false, error: 'Payment gateway not configured on server yet' });
    }
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ verified: false, error: 'Database not configured on server yet' });
    }

    const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    const payload = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(payload)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      await supabaseAdmin.from('orders').update({ status: 'failed' }).eq('razorpay_order_id', razorpay_order_id);
      return res.status(400).json({ verified: false, error: 'Signature mismatch' });
    }

    const { error: updateErr } = await supabaseAdmin
      .from('orders')
      .update({ status: 'paid', razorpay_payment_id })
      .eq('razorpay_order_id', razorpay_order_id);

    if (updateErr) {
      console.error('order update failed:', updateErr);
    }

    return res.status(200).json({ verified: true, paymentId: razorpay_payment_id });
  } catch (err) {
    console.error('verify-payment error:', err);
    return res.status(500).json({ verified: false, error: 'Verification failed' });
  }
};
