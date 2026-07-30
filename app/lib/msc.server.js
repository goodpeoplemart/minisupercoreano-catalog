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
  return generateOrderNumber();
}

export function generateOrderNumber() {
  const now = new Date();
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Mexico_City",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .formatToParts(now)
      .map(({ type, value }) => [type, value]),
  );

  const ymd = `${parts.year}${parts.month}${parts.day}`;
  const hms = `${parts.hour}${parts.minute}${parts.second}`;
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const randomBytes = crypto.getRandomValues(new Uint8Array(4));
  let suffix = "";

  for (let index = 0; index < 4; index += 1) {
    suffix += alphabet[randomBytes[index] % alphabet.length];
  }

  return `MSC-${ymd}-${hms}-${suffix}`;
}

export function formatOrderDateTime(date = new Date()) {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City",
    dateStyle: "long",
    timeStyle: "short",
  }).format(date);
}

export function formatCustomerAddress(customer = {}) {
  return [
    [customer.address, customer.exteriorNumber ? `No. ${customer.exteriorNumber}` : ""]
      .filter(Boolean)
      .join(" "),
    customer.interiorNumber ? `Int. ${customer.interiorNumber}` : "",
    customer.colonia,
    customer.municipality,
    customer.state,
    customer.postalCode ? `C.P. ${customer.postalCode}` : "",
    "México",
  ]
    .filter(Boolean)
    .join(", ");
}

export function buildCustomerNotes(customer = {}) {
  return [customer.reference, customer.comments].filter(Boolean).join("\n");
}

export function formatCustomerDeliveryLines(customer = {}) {
  const lines = [];
  const street = [
    customer.address,
    customer.exteriorNumber ? `No. ${customer.exteriorNumber}` : "",
    customer.interiorNumber ? `Int. ${customer.interiorNumber}` : "",
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  if (street) {
    lines.push({ label: "Calle y número", value: street });
  }

  if (customer.postalCode) {
    lines.push({ label: "Código Postal", value: customer.postalCode });
  }

  if (customer.colonia) {
    lines.push({ label: "Colonia", value: customer.colonia });
  }

  if (customer.municipality) {
    lines.push({ label: "Alcaldía / Municipio", value: customer.municipality });
  }

  if (customer.state) {
    lines.push({ label: "Estado", value: customer.state });
  }

  if (customer.reference) {
    lines.push({ label: "Referencias", value: customer.reference });
  }

  return lines;
}

export function buildOrderEmailHtml({
  orderNumber,
  customer,
  items,
  currencyCode,
  subtotal,
  uniqueProducts,
  totalQuantity,
  orderedAt,
}) {
  const productRows = items
    .map(
      (item, index) => `
        <tr>
          <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;vertical-align:top">
            <strong>${index + 1}. ${escapeHtml(item.title)}</strong><br>
            Cantidad: ${item.quantity}<br>
            Precio unitario: ${money(item.unitPrice, currencyCode)}<br>
            Importe: ${money(item.subtotal, currencyCode)}
          </td>
        </tr>
      `,
    )
    .join("");

  const notes = buildCustomerNotes(customer);
  const deliveryLines = formatCustomerDeliveryLines(customer);
  const deliveryHtml = deliveryLines.length
    ? deliveryLines
        .map(
          (line) =>
            `<strong>${escapeHtml(line.label)}:</strong><br>${escapeHtml(line.value)}<br><br>`,
        )
        .join("")
    : `${escapeHtml(formatCustomerAddress(customer))}<br><br>`;

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:720px;margin:0 auto;color:#111827;line-height:1.5">
      <h1 style="margin:0 0 16px;font-size:24px">PEDIDO NUEVO</h1>

      <p style="margin:0 0 20px">
        <strong>Número de pedido:</strong><br>
        ${escapeHtml(orderNumber)}<br><br>
        <strong>Fecha:</strong><br>
        ${escapeHtml(orderedAt)}
      </p>

      <h2 style="margin:0 0 12px;font-size:18px">DATOS DEL COMPRADOR</h2>
      <p style="margin:0 0 20px">
        <strong>Nombre:</strong><br>
        ${escapeHtml(customer.name || "-")}<br><br>

        <strong>Teléfono:</strong><br>
        ${escapeHtml(customer.phone || "-")}<br><br>

        <strong>Correo electrónico:</strong><br>
        ${escapeHtml(customer.email || "-")}
      </p>

      <h2 style="margin:0 0 12px;font-size:18px">DIRECCIÓN DE ENTREGA</h2>
      <p style="margin:0 0 20px">
        ${deliveryHtml}
      </p>

      <h2 style="margin:0 0 12px;font-size:18px">PRODUCTOS</h2>

      <table style="border-collapse:collapse;width:100%;margin:0 0 20px">
        <tbody>${productRows}</tbody>
      </table>

      <h2 style="margin:0 0 12px;font-size:18px">RESUMEN</h2>
      <p style="margin:0 0 20px">
        <strong>Subtotal:</strong> ${money(subtotal, currencyCode)} ${escapeHtml(currencyCode)}<br>
        <strong>Total:</strong> ${money(subtotal, currencyCode)} ${escapeHtml(currencyCode)}<br>
        <strong>Productos distintos:</strong> ${uniqueProducts}<br>
        <strong>Cantidad total:</strong> ${totalQuantity}
      </p>

      ${
        notes
          ? `<h2 style="margin:0 0 12px;font-size:18px">NOTAS</h2><p style="margin:0 0 20px">${escapeHtml(notes)}</p>`
          : ""
      }
    </div>
  `;
}

export function buildOrderEmailText({
  orderNumber,
  customer,
  items,
  currencyCode,
  subtotal,
  uniqueProducts,
  totalQuantity,
  orderedAt,
}) {
  const notes = buildCustomerNotes(customer);
  const productLines = items
    .map(
      (item, index) =>
        `${index + 1}. ${item.title}\n` +
        `   Cantidad: ${item.quantity}\n` +
        `   Precio unitario: ${money(item.unitPrice, currencyCode)}\n` +
        `   Importe: ${money(item.subtotal, currencyCode)}`,
    )
    .join("\n\n");

  const deliveryLines = formatCustomerDeliveryLines(customer);

  return [
    "PEDIDO NUEVO",
    "",
    "Número de pedido:",
    orderNumber,
    "",
    "Fecha:",
    orderedAt,
    "",
    "DATOS DEL COMPRADOR",
    "",
    "Nombre:",
    customer.name || "-",
    "",
    "Teléfono:",
    customer.phone || "-",
    "",
    "Correo electrónico:",
    customer.email || "-",
    "",
    "DIRECCIÓN DE ENTREGA",
    "",
    ...deliveryLines.flatMap((line) => [line.label + ":", line.value, ""]),
    "",
    "PRODUCTOS",
    "",
    productLines,
    "",
    "Subtotal:",
    money(subtotal, currencyCode),
    "",
    "Total:",
    money(subtotal, currencyCode),
    notes ? "" : null,
    notes ? "Notas:" : null,
    notes ? notes : null,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

export function logOrderEmailConfiguration() {
  const hasApiKey = Boolean(process.env.RESEND_API_KEY);
  const hasFrom = Boolean(
    process.env.ORDER_EMAIL_FROM || process.env.EMAIL_FROM,
  );
  const hasTo = Boolean(
    process.env.ORDER_EMAIL_TO ||
      process.env.SELLER_EMAIL ||
      "goodpeoplemart@gmail.com",
  );

  console.log("[ORDER SERVER] Email config", {
    provider: "resend",
    hasApiKey,
    hasSmtpUser: Boolean(process.env.SMTP_USER),
    hasSmtpPass: Boolean(process.env.SMTP_PASS),
    hasFrom,
    hasTo,
  });

  const missing = [];
  if (!hasApiKey) missing.push("RESEND_API_KEY");
  if (!hasFrom) missing.push("ORDER_EMAIL_FROM");

  if (missing.length) {
    console.error(
      "[ORDER SERVER] Missing email environment variables:",
      missing.join(", "),
    );
  }
}

export function assertOrderEmailConfig() {
  const missing = [];

  if (!process.env.RESEND_API_KEY) {
    missing.push("RESEND_API_KEY");
  }

  const from = process.env.ORDER_EMAIL_FROM || process.env.EMAIL_FROM;
  if (!from) {
    missing.push("ORDER_EMAIL_FROM");
  }

  if (missing.length) {
    throw new Error(`Missing ${missing.join(", ")}`);
  }

  return {
    apiKey: process.env.RESEND_API_KEY,
    from,
    to:
      process.env.ORDER_EMAIL_TO ||
      process.env.SELLER_EMAIL ||
      "goodpeoplemart@gmail.com",
  };
}

export async function sendOrderEmail({ subject, html, text }) {
  const { apiKey, from, to } = assertOrderEmailConfig();

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
      text,
    }),
  });

  if (!response.ok) {
    const preview = (await response.text()).slice(0, 200);
    console.error("[ORDER] Email send failed", {
      status: response.status,
      preview,
    });
    throw new Error("EMAIL_PROVIDER_REJECTED");
  }

  return { ok: true };
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