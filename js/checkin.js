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
      result.innerHTML =
        "<p style='color:red'>❌ Ticket not found.</p>";
      return;
    }

    if (data.status !== "paid") {
      result.innerHTML =
        "<p style='color:red'>❌ Payment not completed.</p>";
      return;
    }

    if (data.ticket_status === "checked_in") {
      result.innerHTML =
        "<p style='color:orange'>⚠️ Ticket already checked in.</p>";
      return;
    }

    if (data.ticket_status === "cancelled") {
      result.innerHTML =
        "<p style='color:red'>❌ Ticket is cancelled.</p>";
      return;
    }

    result.innerHTML = `
      <p><strong>Name:</strong> ${data.customer_name}</p>
      <p><strong>Booking ID:</strong> ${data.booking_id}</p>
      <p><strong>Event:</strong> ${data.event_name}</p>
      <p><strong>Status:</strong> ${data.ticket_status}</p>

      <button id="confirm-checkin" class="btn btn-primary">
        Confirm Check-In
      </button>
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

        result.innerHTML =
          "<h3 style='color:green'>✅ Ticket Checked In Successfully</h3>";
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