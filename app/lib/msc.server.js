export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export function normalizePhone(value = "") {
  return String(value).replace(/[^\d]/g, "");
}

export function requestNumber() {
  const date = new Date();
  const ymd = date.toISOString().slice(0, 10).replaceAll("-", "");

  const random = crypto
    .randomUUID()
    .replaceAll("-", "")
    .slice(0, 6)
    .toUpperCase();

  return `MSC-${ymd}-${random}`;
}

export function splitName(fullName = "") {
  const parts = String(fullName)
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length <= 1) {
    return {
      firstName: parts[0] || "Cliente",
      lastName: "",
    };
  }

  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts.at(-1),
  };
}

export async function graphqlJson(response) {
  const payload = await response.json();

  if (payload.errors?.length) {
    throw new Error(
      payload.errors.map((error) => error.message).join("; "),
    );
  }

  return payload.data;
}

export function money(value, currencyCode = "MXN") {
  const amount = Number(value || 0);

  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: currencyCode,
  }).format(amount);
}

export function formatAddress(buyer) {
  return [
    buyer.address1,
    buyer.address2,
    buyer.colonia,
    buyer.city,
    buyer.state,
    buyer.postalCode,
    "México",
  ]
    .filter(Boolean)
    .join(", ");
}

export function buildSellerEmail({
  requestNo,
  buyer,
  verifiedItems,
  currencyCode,
  subtotal,
}) {
  const itemRows = verifiedItems
    .map(
      (item) => `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #ddd">
            ${escapeHtml(item.title)}
          </td>

          <td style="padding:8px;border-bottom:1px solid #ddd;text-align:right">
            ${money(item.unitPrice, currencyCode)}
          </td>

          <td style="padding:8px;border-bottom:1px solid #ddd;text-align:right">
            ${item.quantity}
          </td>

          <td style="padding:8px;border-bottom:1px solid #ddd;text-align:right">
            ${money(item.unitPrice * item.quantity, currencyCode)}
          </td>
        </tr>
      `,
    )
    .join("");

  return `
    <div style="font-family:Arial,sans-serif;max-width:720px;margin:auto">
      <h1>Nueva solicitud de compra</h1>

      <p>
        <strong>Número:</strong>
        ${escapeHtml(requestNo)}
      </p>

      <h2>Productos</h2>

      <table style="border-collapse:collapse;width:100%">
        <thead>
          <tr>
            <th style="padding:8px;text-align:left;border-bottom:2px solid #333">
              Producto
            </th>

            <th style="padding:8px;text-align:right;border-bottom:2px solid #333">
              Precio unitario
            </th>

            <th style="padding:8px;text-align:right;border-bottom:2px solid #333">
              Cantidad
            </th>

            <th style="padding:8px;text-align:right;border-bottom:2px solid #333">
              Importe
            </th>
          </tr>
        </thead>

        <tbody>
          ${itemRows}
        </tbody>
      </table>

      <p style="text-align:right">
        <strong>
          Subtotal estimado:
          ${money(subtotal, currencyCode)}
        </strong>
      </p>

      <p style="text-align:right">
        Costo de envío: Por confirmar
      </p>

      <h2>Datos del cliente</h2>

      <p>
        <strong>Nombre:</strong>
        ${escapeHtml(buyer.name)}
        <br>

        <strong>Teléfono:</strong>
        ${escapeHtml(buyer.phone)}
        <br>

        <strong>Dirección:</strong>
        ${escapeHtml(formatAddress(buyer))}
      </p>

      <p>
        <strong>Referencias:</strong>
        <br>
        ${escapeHtml(buyer.references || "-")}
      </p>

      <p>
        <strong>Comentarios:</strong>
        <br>
        ${escapeHtml(buyer.comments || "-")}
      </p>
    </div>
  `;
}

export async function sendSellerEmail({ subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.SELLER_EMAIL;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !to || !from) {
    console.warn(
      "Email skipped: RESEND_API_KEY, SELLER_EMAIL or EMAIL_FROM is missing.",
    );

    return false;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
    }),
  });

  if (!response.ok) {
    console.error(
      "Email provider error:",
      response.status,
      await response.text(),
    );

    return false;
  }

  return true;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}