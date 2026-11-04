// api/verify-payment.js
// Verifies Razorpay payment and sends ticket confirmation email.

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { sendTicketEmail } = require('./_lib/ticket-email');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({
      verified: false,
      error: 'Method not allowed'
    });
  }

  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } = req.body || {};

    if (
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature
    ) {
      return res.status(400).json({
        verified: false,
        error: 'Missing payment fields'
      });
    }

    if (!process.env.RAZORPAY_KEY_SECRET) {
      return res.status(500).json({
        verified: false,
        error: 'Payment gateway not configured'
      });
    }

    if (
      !process.env.SUPABASE_URL ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY
    ) {
      return res.status(500).json({
        verified: false,
        error: 'Database not configured'
      });
    }

    const supabaseAdmin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Verify Razorpay signature
    const payload =
      `${razorpay_order_id}|${razorpay_payment_id}`;

    const expectedSignature = crypto
      .createHmac(
        'sha256',
        process.env.RAZORPAY_KEY_SECRET
      )
      .update(payload)
      .digest('hex');

    const expected = Buffer.from(
      expectedSignature,
      'hex'
    );

    const received = Buffer.from(
      String(razorpay_signature),
      'hex'
    );

    if (
      expected.length !== received.length ||
      !crypto.timingSafeEqual(expected, received)
    ) {
      return res.status(400).json({
        verified: false,
        error: 'Signature mismatch'
      });
    }

    // Retrieve existing order
    const {
      data: existingOrder,
      error: findError
    } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('razorpay_order_id', razorpay_order_id)
      .maybeSingle();

    if (findError) {
      console.error('Could not find Razorpay order:', findError);

      return res.status(500).json({
        verified: false,
        error: 'Unable to retrieve booking.'
      });
    }

    if (!existingOrder) {
      return res.status(404).json({
        verified: false,
        error: 'Booking order not found.'
      });
    }

    let paidOrder = existingOrder;

    // Generate booking ID only once
    if (
      existingOrder.status !== 'paid' ||
      !existingOrder.booking_id
    ) {
      const bookingId =
        existingOrder.booking_id ||
        `ANU-${new Date().getFullYear()}-${crypto.randomInt(100000, 1000000)}`;

      const {
        data: updatedOrder,
        error: updateError
      } = await supabaseAdmin
        .from('orders')
        .update({
          status: 'paid',
          razorpay_payment_id,
          booking_id: bookingId,
          qr_code: bookingId,
          ticket_status: 'valid'
        })
        .eq('razorpay_order_id', razorpay_order_id)
        .select('*')
        .single();

      if (updateError || !updatedOrder) {
        console.error(
          'Order payment update failed:',
          updateError
        );

        return res.status(500).json({
          verified: false,
          error: 'Payment was received, but booking confirmation is pending. Please contact AnuRAAGAM support.'
        });
      }

      paidOrder = updatedOrder;
    }

    // Send ticket email
    // Email failure does not reverse successful payment.
    const emailResult = await sendTicketEmail(
      supabaseAdmin,
      paidOrder
    );

    return res.status(200).json({
      verified: true,
      paymentId: razorpay_payment_id,
      bookingId: paidOrder.booking_id,
      emailSent: Boolean(emailResult.sent),
      emailMessage: emailResult.sent
        ? 'Ticket email sent.'
        : 'Booking confirmed. Ticket email is pending or could not be sent.'
    });

  } catch (err) {
    console.error('Verify-payment error:', err);

    return res.status(500).json({
      verified: false,
      error: 'Verification failed'
    });
  }
};