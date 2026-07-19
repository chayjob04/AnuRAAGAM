document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("qr-input");
  const btn = document.getElementById("checkin-btn");
  const result = document.getElementById("checkin-result");
  const scanBtn = document.getElementById("scan-qr-btn");
  const qrReaderDiv = document.getElementById("qr-reader");

  async function checkTicket() {
    const bookingId = input.value.trim();

    if (!bookingId) {
      result.innerHTML = "<p>Please enter a Booking ID.</p>";
      return;
    }

    const { data, error } = await supabaseClient
      .from("orders")
      .select("*")
      .eq("booking_id", bookingId)
      .single();

if (error || !data) {
  result.innerHTML = `
    <div style="
      background:#ffe5e5;
      border:2px solid red;
      border-radius:12px;
      padding:20px;
      text-align:center;
    ">
      <h2>❌ INVALID TICKET</h2>
      <p>No booking found.</p>
    </div>
  `;
  return;
}

    if (data.status !== "paid") {
      result.innerHTML =
        "<p style='color:red'>❌ Payment not completed.</p>";
      return;
    }

if (data.ticket_status === "checked_in") {
  result.innerHTML = `
    <div style="
      background:#fff7d6;
      border:2px solid orange;
      border-radius:12px;
      padding:20px;
      text-align:center;
    ">
      <h2>⚠️ ALREADY CHECKED IN</h2>
      <p>${data.attendee_name}</p>
      <p>${data.booking_id}</p>
    </div>
  `;
  return;
}

    if (data.ticket_status === "cancelled") {
      result.innerHTML =
        "<p style='color:red'>❌ Ticket is cancelled.</p>";
      return;
    }

result.innerHTML = `
<div style="
background:#e8fff0;
border:2px solid #22c55e;
border-radius:12px;
padding:20px;
margin-top:20px;
">

<h2 style="color:#16a34a;margin:0 0 15px;">
✅ VALID TICKET
</h2>

<p><strong>👤 Name:</strong> ${data.attendee_name}</p>
<p><strong>🎫 Booking ID:</strong> ${data.booking_id}</p>
<p><strong>🎉 Event:</strong> ${data.event_name}</p>
<p><strong>📌 Status:</strong> VALID</p>

<button id="confirm-checkin" class="btn btn-primary" style="margin-top:15px;">
Confirm Check-In
</button>

</div>
`;

    document
      .getElementById("confirm-checkin")
      .addEventListener("click", async () => {

        const { error } = await supabaseClient
          .from("orders")
          .update({
            ticket_status: "checked_in"
          })
          .eq("booking_id", bookingId);

        if (error) {
          alert("Check-In Failed");
          return;
        }

result.innerHTML = `
<div style="
background:#dcfce7;
border:2px solid #16a34a;
border-radius:12px;
padding:20px;
text-align:center;
">

<h2>✅ CHECK-IN SUCCESSFUL</h2>

<p>${data.attendee_name} has entered the event.</p>

</div>
`;
      });
  }

  btn.addEventListener("click", checkTicket);

  scanBtn.addEventListener("click", () => {
    qrReaderDiv.style.display = "block";

    const qr = new Html5Qrcode("qr-reader");

    qr.start(
      { facingMode: "environment" },
      {
        fps: 10,
        qrbox: 250
      },
      (decodedText) => {
        input.value = decodedText;

        qr.stop().then(() => {
          qrReaderDiv.style.display = "none";
          checkTicket();
        });
      }
    );
  });
});