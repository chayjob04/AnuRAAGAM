// api/create-order.js
// Creates a Razorpay order for a real event stored in Supabase, validating
// the price server-side, and writes a "pending" row to the orders table
// so it shows up in the user's My Orders page even before payment completes.

const Razorpay = require('razorpay');
const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) {
      return res.status(401).json({ error: 'Please log in to book a ticket.' });
    }

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: 'Database not configured on server yet' });
    }
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return res.status(500).json({ error: 'Payment gateway not configured on server yet' });
    }

    const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData || !userData.user) {
      return res.status(401).json({ error: 'Your session has expired. Please log in again.' });
    }
    const user = userData.user;

    const {
  eventId,
  qty,
  attendeeName,
  attendeeEmail,
  attendeePhone,
  promoCode
} = req.body || {};
    const quantity = Math.max(1, Math.min(10, parseInt(qty, 10) || 1));

    const { data: event, error: eventErr } = await supabaseAdmin
      .from('events')
      .select('*')
      .eq('id', eventId)
      .eq('is_published', true)
      .single();

    if (eventErr || !event) {
      return res.status(400).json({ error: 'This event is no longer available.' });
    }

    const ticketTotal = event.price * quantity;

const code = (promoCode || "").toUpperCase();

let discount = 0;

if (code === "ANURAAGAM100") {
  discount = ticketTotal; // 100% OFF
} else if (["AVI50", "VASISHT50", "EARLY50"].includes(code)) {
  discount = 50; // ₹50 OFF
}

const subtotal = Math.max(0, ticketTotal - discount);

// Always calculate fee on original ticket price
const fee = Math.round(ticketTotal * 0.02);

const total = subtotal + fee;

const amountPaise = total * 100;
if (code === "ANURAAGAM100") {
  const bookingId = `ANU${Date.now()}`;

  const { data: orderData, error: insertErr } = await supabaseAdmin
    .from("orders")
    .insert({
      user_id: user.id,
      event_id: event.id,
      event_name: event.name,
      event_date: event.event_date,
      event_venue: event.venue,
      price_per_seat: event.price,
      quantity,
      subtotal,
      discount,
      promo_code: promoCode ? promoCode.toUpperCase() : null,
      fee: 0,
      final_amount: 0,
      total: 0,
      attendee_name: attendeeName || null,
      attendee_email: attendeeEmail || null,
      attendee_phone: attendeePhone || null,
      booking_id: bookingId,
      status: "paid",
ticket_status: "valid",
qr_code: bookingId
    })
    .select()
    .single();

  if (insertErr) throw insertErr;

  return res.status(200).json({
    freeOrder: true,
    orderId: orderData.id,
    bookingId
  });
}

    const rzp = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const order = await rzp.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: `anuraagam_${Date.now()}`,
      payment_capture: 1,
      notes: { eventId, quantity: String(quantity), userId: user.id },
    });

    const { error: insertErr } = await supabaseAdmin.from('orders').insert({
      user_id: user.id,
      event_id: event.id,
      event_name: event.name,
      event_date: event.event_date,
      event_venue: event.venue,
      price_per_seat: event.price,
      quantity,
      subtotal,
discount,
promo_code: promoCode ? promoCode.toUpperCase() : null,
fee,
final_amount: total,
total,
      attendee_name: attendeeName || null,
      attendee_email: attendeeEmail || null,
      attendee_phone: attendeePhone || null,
      razorpay_order_id: order.id,
      status: 'pending',
    });

    if (insertErr) {
      console.error('order insert failed:', insertErr);
    }

    return res.status(200).json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      breakdown: { pricePerSeat: event.price, quantity, subtotal, fee, total },
    });
  } catch (err) {
    console.error('create-order error:', err);
    return res.status(500).json({ error: 'Unable to create order' });
  }
};
