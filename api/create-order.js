// api/create-order.js
// Creates Razorpay orders and handles free bookings.

const Razorpay = require('razorpay');
const { createClient } = require('@supabase/supabase-js');
const { sendTicketEmail } = require('./_lib/ticket-email');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '').trim();

    if (!token) {
      return res.status(401).json({
        error: 'Please log in to book a ticket.'
      });
    }

    if (!process.env.SUPABASE_URL ||
        !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({
        error: 'Database not configured on server yet'
      });
    }

    if (!process.env.RAZORPAY_KEY_ID ||
        !process.env.RAZORPAY_KEY_SECRET) {
      return res.status(500).json({
        error: 'Payment gateway not configured on server yet'
      });
    }

    const supabaseAdmin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: userData, error: userErr } =
      await supabaseAdmin.auth.getUser(token);

    if (userErr || !userData || !userData.user) {
      return res.status(401).json({
        error: 'Your session has expired. Please log in again.'
      });
    }

    const user = userData.user;

    const {
      eventId,
      qty,
      attendeeName,
      attendeeEmail,
      attendeePhone,
      promoCode,
      collegeIdPath,
      categoryIndex
    } = req.body || {};

    const quantity = Math.max(
      1,
      Math.min(10, parseInt(qty, 10) || 1)
    );

    const { data: event, error: eventErr } =
      await supabaseAdmin
        .from('events')
        .select('*')
        .eq('id', eventId)
        .eq('is_published', true)
        .single();

    if (eventErr || !event) {
      return res.status(400).json({
        error: 'This event is no longer available.'
      });
    }

    const cats =
      Array.isArray(event.ticket_categories) &&
      event.ticket_categories.length
        ? event.ticket_categories
        : [{ name: 'General Entry', price: event.price }];

    const category = cats[
      Math.min(
        Math.max(parseInt(categoryIndex, 10) || 0, 0),
        cats.length - 1
      )
    ];

    const unitPrice = Number(category.price) || 0;
    const ticketTotal = unitPrice * quantity;

    const code = (promoCode || '').trim().toUpperCase();
    const isCollegeFreePass = code === 'MALLAREDDY';

    if (isCollegeFreePass && !collegeIdPath) {
      return res.status(400).json({
        error: 'College ID is required for this free pass.'
      });
    }

    let discount = 0;

    const promoCodes = Array.isArray(event.promo_codes)
      ? event.promo_codes
      : [];

    const matchedPromo = promoCodes.find(
      promo =>
        String(promo.code || '').trim().toUpperCase() === code
    );

    if (code && !matchedPromo) {
      return res.status(400).json({
        error: 'Invalid promo code for this event.'
      });
    }

    if (matchedPromo) {
      const minQty = Number(matchedPromo.minQty) || 1;

      if (quantity < minQty) {
        return res.status(400).json({
          error: `This promo code requires at least ${minQty} tickets.`
        });
      }

      const discountType = String(
        matchedPromo.type || 'fixed'
      ).toLowerCase();

      const discountValue =
        Number(matchedPromo.discount) || 0;

      if (discountType === 'percentage') {
        discount = Math.round(
          ticketTotal * (discountValue / 100)
        );
      } else {
        discount = discountValue * quantity;
      }

      discount = Math.min(discount, ticketTotal);
    }

    const subtotal = Math.max(0, ticketTotal - discount);

    // 2% booking fee after discount
    const fee = Math.round(subtotal * 0.02);

    const total = subtotal + fee;
    const amountPaise = Math.round(total * 100);

    // FREE BOOKING
    if (total === 0) {
      const bookingId = `ANU${Date.now()}`;

      const { data: freeOrder, error: freeOrderErr } =
        await supabaseAdmin
          .from('orders')
          .insert({
            user_id: user.id,
            event_id: event.id,
            event_name: event.name,
            event_date: event.event_date,
            event_venue: event.venue,
            price_per_seat: unitPrice,
            ticket_category: category.name,
            quantity,
            subtotal,
            discount,
            promo_code: promoCode
              ? promoCode.toUpperCase()
              : null,
            fee: 0,
            final_amount: 0,
            total: 0,
            attendee_name: attendeeName || null,
            attendee_email: attendeeEmail || null,
            attendee_phone: attendeePhone || null,
            college_id_path: collegeIdPath || null,
            booking_id: bookingId,
            status: 'paid',
            ticket_status: 'valid',
            qr_code: bookingId
          })
          .select()
          .single();

      if (freeOrderErr) {
        console.error('Free order insert failed:', freeOrderErr);

        return res.status(500).json({
          error: 'Unable to create free booking'
        });
      }

      // Send free ticket email
      const emailResult = await sendTicketEmail(
        supabaseAdmin,
        freeOrder
      );

      return res.status(200).json({
        freeOrder: true,
        emailSent: Boolean(emailResult.sent),
        orderId: freeOrder.id,
        bookingId,
        breakdown: {
          pricePerSeat: unitPrice,
          quantity,
          subtotal,
          discount,
          fee: 0,
          total: 0
        }
      });
    }

    // PAID BOOKING
    const rzp = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });

    const order = await rzp.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: `anuraagam_${Date.now()}`,
      payment_capture: 1,
      notes: {
        eventId,
        quantity: String(quantity),
        userId: user.id
      }
    });

    const { error: insertErr } =
      await supabaseAdmin
        .from('orders')
        .insert({
          user_id: user.id,
          event_id: event.id,
          event_name: event.name,
          event_date: event.event_date,
          event_venue: event.venue,
          price_per_seat: unitPrice,
          ticket_category: category.name,
          quantity,
          subtotal,
          discount,
          promo_code: promoCode
            ? promoCode.toUpperCase()
            : null,
          fee,
          final_amount: total,
          total,
          attendee_name: attendeeName || null,
          attendee_email: attendeeEmail || null,
          attendee_phone: attendeePhone || null,
          college_id_path: collegeIdPath || null,
          razorpay_order_id: order.id,
          status: 'pending'
        });

    if (insertErr) {
      console.error('Order insert failed:', insertErr);

      return res.status(500).json({
        error: 'Unable to create order. Please try again.'
      });
    }

    return res.status(200).json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      breakdown: {
        pricePerSeat: unitPrice,
        quantity,
        subtotal,
        fee,
        total
      }
    });

  } catch (err) {
    console.error('Create-order error:', err);

    return res.status(500).json({
      error: 'Unable to create order'
    });
  }
};