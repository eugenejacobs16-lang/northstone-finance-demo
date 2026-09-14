function clean(value, maximumLength) {
  return String(value || "").trim().slice(0, maximumLength);
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

function validContact(value) {
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phone = /^[+\d][\d\s().-]{6,}$/;

  return email.test(value) || phone.test(value);
}

module.exports = async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");

    return response.status(405).json({
      error: "Method not allowed."
    });
  }

  let body = request.body || {};

  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return response.status(400).json({
        error: "Invalid request."
      });
    }
  }

  // Hidden spam-protection field
  if (body.website) {
    return response.status(200).json({ ok: true });
  }

  const enquiry = {
    help: clean(body.help, 120),
    business: clean(body.business, 120),
    name: clean(body.name, 100),
    contact: clean(body.contact, 160),
    message: clean(body.message, 2000)
  };

  if (
    !enquiry.help ||
    !enquiry.name ||
    !validContact(enquiry.contact)
  ) {
    return response.status(400).json({
      error:
        "Please provide your name, a valid email address or mobile number, and the help you require."
    });
  }

  const apiKey = process.env.RESEND_API_KEY;

  const recipient =
    process.env.ENQUIRY_TO_EMAIL ||
    "info@northstonefinance.co.za";

  const sender =
    process.env.ENQUIRY_FROM_EMAIL ||
    "Northstone Website <website@send.northstonefinance.co.za>";

  if (!apiKey) {
    console.error("RESEND_API_KEY has not been configured.");

    return response.status(503).json({
      error:
        "Online enquiries are temporarily unavailable. Please contact Northstone by email or WhatsApp."
    });
  }

  const fields = [
    ["Help required", enquiry.help],
    ["Business", enquiry.business || "Not supplied"],
    ["Name", enquiry.name],
    ["Contact", enquiry.contact],
    ["Message", enquiry.message || "Not supplied"]
  ];

  const rows = fields
    .map(([label, value]) => `
      <tr>
        <th style="padding:10px;text-align:left;vertical-align:top;border-bottom:1px solid #e5e7eb;">
          ${escapeHtml(label)}
        </th>

        <td style="padding:10px;border-bottom:1px solid #e5e7eb;">
          ${escapeHtml(value).replace(/\n/g, "<br>")}
        </td>
      </tr>
    `)
    .join("");

  const email = {
    from: sender,
    to: [recipient],
    subject: `New website enquiry from ${enquiry.name}`,

    html: `
      <h2>New Northstone Finance enquiry</h2>

      <table style="border-collapse:collapse;width:100%;max-width:680px;">
        ${rows}
      </table>

      <p style="color:#667085;font-size:13px;">
        Submitted through northstonefinance.co.za
      </p>
    `,

    text: [
      "New Northstone Finance enquiry",
      "",
      `Help required: ${enquiry.help}`,
      `Business: ${enquiry.business || "Not supplied"}`,
      `Name: ${enquiry.name}`,
      `Contact: ${enquiry.contact}`,
      `Message: ${enquiry.message || "Not supplied"}`
    ].join("\n")
  };

  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(enquiry.contact)) {
    email.reply_to = enquiry.contact;
  }

  try {
    const resendResponse = await fetch(
      "https://api.resend.com/emails",
      {
        method: "POST",

        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },

        body: JSON.stringify(email)
      }
    );

    if (!resendResponse.ok) {
      const details = await resendResponse.text();

      console.error(
        "Resend rejected the enquiry:",
        resendResponse.status,
        details
      );

      return response.status(502).json({
        error:
          "We could not send your enquiry. Please contact Northstone by email or WhatsApp."
      });
    }

    return response.status(200).json({ ok: true });
  } catch (error) {
    console.error("Enquiry delivery failed:", error);

    return response.status(502).json({
      error:
        "We could not send your enquiry. Please contact Northstone by email or WhatsApp."
    });
  }
};