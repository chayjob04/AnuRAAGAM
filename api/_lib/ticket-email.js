const { Resend } = require('resend');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function formatDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value || 'To be announced');
  }

  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'full',
    timeStyle: 'short'
  });
}

async function sendTicketEmail(supabaseAdmin, order) {
  const recipient = String(
    order.attendee_email || ''
  ).trim();

  if (!recipient) {
    console.warn(
      'Ticket email skipped: attendee email is missing.',
      order.id
    );

    return {
      sent: false,
      reason: 'Customer email address is missing.'
    };
  }

  if (!process.env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY is not configured.');

    return {
      sent: false,
      reason: 'Email service is not configured.'
    };
  }

  // Claim email to prevent duplicate sends
  const { data: claimed, error: claimError } =
    await supabaseAdmin
      .from('orders')
      .update({
        ticket_email_status: 'sending',
        ticket_email_error: null
      })
      .eq('id', order.id)
      .eq('ticket_email_status', 'not_sent')
      .select('id')
      .maybeSingle();

  if (claimError) {
    console.error(
      'Could not claim ticket email:',
      claimError
    );

    return {
      sent: false,
      reason: 'Could not update email delivery status.'
    };
  }

  if (!claimed) {
    return {
      sent: false,
      skipped: true,
      reason: 'Email already processed or in progress.'
    };
  }

  const bookingId = order.booking_id;

  const ticketUrl = bookingId
    ? `https://anuraagam.com/ticket.html?id=${encodeURIComponent(bookingId)}`
    : 'https://anuraagam.com';

  const details = [
    ['Event', order.event_name],
    ['Date & time', formatDate(order.event_date)],
    ['Venue', order.event_venue],
    ['Ticket category', order.ticket_category || 'General Entry'],
    ['Quantity', order.quantity],
    ['Booking ID', bookingId],
    [
      'Amount paid',
      `₹${Number(
        order.final_amount ?? order.total ?? 0
      ).toLocaleString('en-IN')}`
    ]
  ];

  const rows = details.map(([label, value]) =>
    `<tr>
      <td style="padding:9px 12px;color:#666;border-bottom:1px solid #eee">
        ${escapeHtml(label)}
      </td>
      <td style="padding:9px 12px;font-weight:600;border-bottom:1px solid #eee">
        ${escapeHtml(value)}
      </td>
    </tr>`
  ).join('');

  try {
    const resend = new Resend(
      process.env.RESEND_API_KEY
    );

    const { data, error } = await resend.emails.send({
      from: 'AnuRAAGAM Tickets <official@anuraagam.com>',
      to: [recipient],
      replyTo: 'official@anuraagam.com',

      subject: `Your AnuRAAGAM ticket is confirmed – ${order.event_name}`,

      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#222">

          <h2 style="margin-bottom:8px">
            Your booking is confirmed!
          </h2>

          <p>
            Hi ${escapeHtml(order.attendee_name || 'there')},
          </p>

          <p>
            Thank you for booking with AnuRAAGAM.
            Your ticket details are below.
          </p>

          <table style="width:100%;border-collapse:collapse;margin:20px 0">
            ${rows}
          </table>

          <p style="margin:24px 0">
            <a
              href="${ticketUrl}"
              style="background:#a51d2d;color:#fff;padding:12px 20px;text-decoration:none;border-radius:5px;display:inline-block"
            >
              View Your Ticket
            </a>
          </p>

          <p>
            Please arrive at the venue at least
            15 minutes before the show.
          </p>

          <p>
            Keep your booking ID ready at the venue
            for check-in.
          </p>

          <p>
            Regards,<br>
            <strong>AnuRAAGAM Team</strong>
          </p>

        </div>
      `
    });

    if (error) {
      throw new Error(
        error.message || 'Resend rejected the email.'
      );
    }

    // Mark email as sent
    const { error: sentUpdateError } =
      await supabaseAdmin
        .from('orders')
        .update({
          ticket_email_status: 'sent',
          ticket_email_sent_at: new Date().toISOString(),
          ticket_email_error: null
        })
        .eq('id', order.id);

    if (sentUpdateError) {
      console.error(
        'Email sent but status update failed:',
        sentUpdateError
      );
    }

    return {
      sent: true,
      emailId: data?.id || null
    };

  } catch (err) {
    console.error('Ticket email send failed:', err);

    await supabaseAdmin
      .from('orders')
      .update({
        ticket_email_status: 'failed',
        ticket_email_error: String(
          err.message || err
        ).slice(0, 1000)
      })
      .eq('id', order.id);

    return {
      sent: false,
      reason: 'Ticket email could not be sent.'
    };
  }
}

module.exports = {
  sendTicketEmail
};