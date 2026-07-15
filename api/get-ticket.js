const { createClient } = require("@supabase/supabase-js");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.replace("Bearer ", "").trim();

    if (!token) {
      return res.status(401).json({ error: "Please login first." });
    }

        const bookingId = req.query.id;
    if (!bookingId) {
      return res.status(400).json({ error: "Booking ID missing." });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Verify logged-in user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: "Invalid session." });
    }

    // Fetch only this user's ticket
    const { data: order, error } = await supabase
      .from("orders")
      .select("*")
      .eq("booking_id", bookingId)
      .eq("user_id", user.id)
      .single();

    if (error || !order) {
      return res.status(404).json({ error: "Ticket not found." });
    }

    return res.status(200).json(order);

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Internal server error",
    });
  }
};