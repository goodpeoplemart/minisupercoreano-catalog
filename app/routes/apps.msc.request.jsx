import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

/**
 * Shopify app proxy endpoint:
 * Storefront: /apps/msc/request
 * Remix route: app/routes/apps.msc.request.jsx
 *
 * Required app scope:
 *   write_draft_orders
 *
 * Optional environment variables:
 *   MSC_WHATSAPP_NUMBER=525512345678
 *   MSC_ORDER_WEBHOOK_URL=https://script.google.com/macros/s/.../exec
 *   MSC_ORDER_WEBHOOK_SECRET=replace-with-a-long-random-value
 */

const DRAFT_ORDER_CREATE = `#graphql
  mutation MscDraftOrderCreate($input: DraftOrderInput!) {
    draftOrderCreate(input: $input) {
      draftOrder {
        id
        name
        invoiceUrl
        status
        totalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export async function loader() {
  return json(
    { ok: false, error: "Método no permitido." },
    { status: 405, headers: noStoreHeaders() },
  );
}

export async function action({ request }) {
  if (request.method !== "POST") {
    return json(
      { ok: false, error: "Método no permitido." },
      { status: 405, headers: noStoreHeaders() },
    );
  }

  let admin;

  try {
    const auth = await authenticate.public.appProxy(request);
    admin = auth.admin;
  } catch (error) {
    console.error("MSC app proxy authentication failed:", error);
    return json(
      { ok: false, error: "No se pudo autenticar la solicitud de la tienda." },
      { status: 401, headers: noStoreHeaders() },
    );
  }

  if (!admin) {
    return json(
      {
        ok: false,
        error:
          "La aplicación no tiene una sesión administrativa disponible. " +
          "Abra la aplicación desde Shopify Admin y vuelva a intentarlo.",
      },
      { status: 401, headers: noStoreHeaders() },
    );
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return json(
      { ok: false, error: "El cuerpo de la solicitud no es JSON válido." },
      { status: 400, headers: noStoreHeaders() },
    );
  }

  const validationErrors = validateOrder(body);

  if (validationErrors.length) {
    return json(
      { ok: false, error: "Faltan datos obligatorios.", errors: validationErrors },
      { status: 400, headers: noStoreHeaders() },
    );
  }

  const customer = sanitizeCustomer(body.customer);
  const currency = normalizeCurrency(body.currency);
  const lineItems = body.items.map((item) => toDraftLineItem(item, currency));
  const shippingAddress = toShippingAddress(customer);
  const note = createDraftNote(customer);
  const customAttributes = createCustomAttributes(customer);

  const input = {
    lineItems,
    email: customer.email || undefined,
    phone: customer.phone || undefined,
    shippingAddress,
    billingAddress: shippingAddress,
    note,
    tags: ["MSC Catalog", "WhatsApp", "Solicitud web"],
    customAttributes,
    presentmentCurrencyCode: currency,
    visibleToCustomer: false,
  };

  let result;

  try {
    const response = await admin.graphql(DRAFT_ORDER_CREATE, {
      variables: { input },
    });

    result = await response.json();
  } catch (error) {
    console.error("MSC draftOrderCreate request failed:", error);
    return json(
      {
        ok: false,
        error:
          "Shopify no pudo crear el pedido preliminar. Revise el permiso write_draft_orders.",
      },
      { status: 502, headers: noStoreHeaders() },
    );
  }

  const payload = result?.data?.draftOrderCreate;
  const graphqlErrors = Array.isArray(result?.errors) ? result.errors : [];
  const userErrors = Array.isArray(payload?.userErrors) ? payload.userErrors : [];

  if (graphqlErrors.length || userErrors.length || !payload?.draftOrder) {
    const errors = [...graphqlErrors, ...userErrors].map((item) => ({
      field: Array.isArray(item.field) ? item.field.join(".") : item.field || "",
      message: item.message || "Error desconocido de Shopify.",
    }));

    console.error("MSC draftOrderCreate errors:", errors);

    return json(
      {
        ok: false,
        error: "Shopify rechazó la creación del pedido preliminar.",
        errors,
      },
      { status: 422, headers: noStoreHeaders() },
    );
  }

  const draftOrder = payload.draftOrder;
  const whatsappNumber = digitsOnly(
    process.env.MSC_WHATSAPP_NUMBER || body.whatsappNumber || "",
  );

  const whatsappUrl = whatsappNumber
    ? createWhatsAppUrl({
        phone: whatsappNumber,
        customer,
        items: body.items,
        currency,
        draftOrderName: draftOrder.name,
      })
    : "";

  const webhookPayload = {
    event: "msc.order.created",
    createdAt: new Date().toISOString(),
    draftOrder: {
      id: draftOrder.id,
      name: draftOrder.name,
      invoiceUrl: draftOrder.invoiceUrl || "",
      status: draftOrder.status || "",
      total:
        draftOrder.totalPriceSet?.shopMoney?.amount ??
        calculateClientTotal(body.items),
      currency:
        draftOrder.totalPriceSet?.shopMoney?.currencyCode ??
        currency,
    },
    customer,
    items: body.items.map((item) => ({
      productId: String(item.productId || ""),
      variantId: String(item.variantId || ""),
      title: cleanText(item.title, 250),
      price: normalizePrice(item.price),
      quantity: normalizeQuantity(item.quantity),
      total: normalizePrice(item.price) * normalizeQuantity(item.quantity),
    })),
  };

  const webhook = await sendOptionalWebhook(webhookPayload);

  return json(
    {
      ok: true,
      draftOrderId: draftOrder.id,
      draftOrderName: draftOrder.name,
      invoiceUrl: draftOrder.invoiceUrl || "",
      whatsappUrl,
      notification: webhook,
    },
    { status: 201, headers: noStoreHeaders() },
  );
}

function validateOrder(body) {
  const errors = [];
  const customer = body?.customer ?? {};
  const items = Array.isArray(body?.items) ? body.items : [];

  if (!cleanText(customer.name, 150)) {
    errors.push({ field: "customer.name", message: "Nombre requerido." });
  }

  if (!digitsOnly(customer.phone)) {
    errors.push({ field: "customer.phone", message: "Teléfono requerido." });
  }

  if (!cleanText(customer.address, 250)) {
    errors.push({ field: "customer.address", message: "Dirección requerida." });
  }

  if (!cleanText(customer.exteriorNumber, 50)) {
    errors.push({
      field: "customer.exteriorNumber",
      message: "Número exterior requerido.",
    });
  }

  if (!cleanText(customer.colonia, 150)) {
    errors.push({ field: "customer.colonia", message: "Colonia requerida." });
  }

  if (!cleanText(customer.municipality, 150)) {
    errors.push({
      field: "customer.municipality",
      message: "Alcaldía o municipio requerido.",
    });
  }

  if (!cleanText(customer.state, 150)) {
    errors.push({ field: "customer.state", message: "Estado requerido." });
  }

  if (!/^\d{5}$/.test(String(customer.postalCode || "").trim())) {
    errors.push({
      field: "customer.postalCode",
      message: "El código postal debe tener 5 dígitos.",
    });
  }

  if (!items.length) {
    errors.push({ field: "items", message: "La lista de productos está vacía." });
  }

  items.forEach((item, index) => {
    if (!cleanText(item?.title, 250)) {
      errors.push({
        field: `items.${index}.title`,
        message: "El producto no tiene nombre.",
      });
    }

    if (normalizeQuantity(item?.quantity) < 1) {
      errors.push({
        field: `items.${index}.quantity`,
        message: "Cantidad inválida.",
      });
    }

    if (normalizePrice(item?.price) < 0) {
      errors.push({
        field: `items.${index}.price`,
        message: "Precio inválido.",
      });
    }
  });

  return errors;
}

function sanitizeCustomer(raw = {}) {
  return {
    name: cleanText(raw.name, 150),
    phone: cleanText(raw.phone, 50),
    email: normalizeEmail(raw.email),
    address: cleanText(raw.address, 250),
    exteriorNumber: cleanText(raw.exteriorNumber, 50),
    interiorNumber: cleanText(raw.interiorNumber, 50),
    colonia: cleanText(raw.colonia, 150),
    municipality: cleanText(raw.municipality, 150),
    state: cleanText(raw.state, 150),
    postalCode: cleanText(raw.postalCode, 10),
    deliveryTime: cleanText(raw.deliveryTime, 100),
    reference: cleanText(raw.reference, 500),
    comments: cleanText(raw.comments, 1000),
  };
}

function toDraftLineItem(item, currency) {
  const quantity = normalizeQuantity(item.quantity);
  const variantId = normalizeVariantGid(item.variantId);

  if (variantId) {
    return {
      variantId,
      quantity,
    };
  }

  return {
    title: cleanText(item.title, 250) || "Producto MSC",
    quantity,
    originalUnitPriceWithCurrency: {
      amount: normalizePrice(item.price).toFixed(2),
      currencyCode: currency,
    },
    taxable: true,
    requiresShipping: true,
    customAttributes: [
      {
        key: "MSC product ID",
        value: cleanText(item.productId, 250),
      },
    ].filter((attribute) => attribute.value),
  };
}

function toShippingAddress(customer) {
  const { firstName, lastName } = splitName(customer.name);

  const address1 = [
    customer.address,
    customer.exteriorNumber ? `No. ${customer.exteriorNumber}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const address2 = [
    customer.interiorNumber ? `Int. ${customer.interiorNumber}` : "",
    customer.colonia,
  ]
    .filter(Boolean)
    .join(", ");

  return {
    firstName,
    lastName,
    address1,
    address2: address2 || undefined,
    city: customer.municipality,
    province: customer.state,
    countryCode: "MX",
    zip: customer.postalCode,
    phone: customer.phone,
  };
}

function createDraftNote(customer) {
  return [
    "Pedido recibido desde MSC Catalog.",
    customer.deliveryTime
      ? `Horario preferido: ${customer.deliveryTime}`
      : "",
    customer.reference ? `Referencias: ${customer.reference}` : "",
    customer.comments ? `Comentarios: ${customer.comments}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function createCustomAttributes(customer) {
  return [
    ["Canal", "MSC Catalog / WhatsApp"],
    ["Nombre del comprador", customer.name],
    ["Teléfono", customer.phone],
    ["Horario preferido", customer.deliveryTime],
    ["Referencias", customer.reference],
    ["Comentarios", customer.comments],
  ]
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => ({ key, value }));
}

async function sendOptionalWebhook(payload) {
  const url = process.env.MSC_ORDER_WEBHOOK_URL;
  const secret = process.env.MSC_ORDER_WEBHOOK_SECRET || "";

  if (!url) {
    return {
      enabled: false,
      sent: false,
      message: "Webhook no configurado.",
    };
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-MSC-Webhook-Secret": secret,
      },
      body: JSON.stringify({
        ...payload,
        webhookSecret: secret,
      }),
      signal: AbortSignal.timeout(8000),
    });

    const text = await response.text();

    return {
      enabled: true,
      sent: response.ok,
      status: response.status,
      response: text.slice(0, 500),
    };
  } catch (error) {
    console.error("MSC notification webhook failed:", error);
    return {
      enabled: true,
      sent: false,
      message: error.message || "Webhook error.",
    };
  }
}

function createWhatsAppUrl({
  phone,
  customer,
  items,
  currency,
  draftOrderName,
}) {
  const address = [
    `${customer.address} ${customer.exteriorNumber}`.trim(),
    customer.interiorNumber ? `Int. ${customer.interiorNumber}` : "",
    customer.colonia,
    customer.municipality,
    customer.state,
    customer.postalCode ? `C.P. ${customer.postalCode}` : "",
  ]
    .filter(Boolean)
    .join(", ");

  const lines = [
    `Hola, mi pedido fue guardado como ${draftOrderName}.`,
    "",
    ...items.map(
      (item) =>
        `• ${cleanText(item.title, 250)} × ${normalizeQuantity(item.quantity)} — ` +
        formatMoney(
          normalizePrice(item.price) * normalizeQuantity(item.quantity),
          currency,
        ),
    ),
    "",
    `Total aproximado: ${formatMoney(calculateClientTotal(items), currency)}`,
    "",
    `Nombre: ${customer.name}`,
    `Teléfono: ${customer.phone}`,
    `Dirección: ${address}`,
    customer.email ? `Correo: ${customer.email}` : "",
    customer.deliveryTime ? `Horario: ${customer.deliveryTime}` : "",
    customer.reference ? `Referencias: ${customer.reference}` : "",
    customer.comments ? `Comentarios: ${customer.comments}` : "",
  ].filter(Boolean);

  return `https://wa.me/${phone}?text=${encodeURIComponent(lines.join("\n"))}`;
}

function splitName(fullName) {
  const parts = cleanText(fullName, 150).split(/\s+/).filter(Boolean);

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "." };
  }

  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts.at(-1),
  };
}

function normalizeVariantGid(value) {
  const raw = String(value || "").trim();

  if (!raw) return "";
  if (/^gid:\/\/shopify\/ProductVariant\/\d+$/.test(raw)) return raw;
  if (/^\d+$/.test(raw)) return `gid://shopify/ProductVariant/${raw}`;

  return "";
}

function normalizeCurrency(value) {
  const currency = String(value || "MXN").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : "MXN";
}

function normalizeQuantity(value) {
  const quantity = Number.parseInt(value, 10);
  return Number.isFinite(quantity) && quantity > 0
    ? Math.min(quantity, 999)
    : 0;
}

function normalizePrice(value) {
  const price = Number(value);
  return Number.isFinite(price) && price >= 0 ? price : -1;
}

function calculateClientTotal(items) {
  return (Array.isArray(items) ? items : []).reduce(
    (sum, item) =>
      sum + Math.max(0, normalizePrice(item.price)) * normalizeQuantity(item.quantity),
    0,
  );
}

function formatMoney(amount, currency) {
  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return `$${Number(amount || 0).toFixed(2)} ${currency}`;
  }
}

function normalizeEmail(value) {
  const email = cleanText(value, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function cleanText(value, maxLength = 500) {
  return String(value ?? "")
    .replace(/\0/g, "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, maxLength);
}

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function noStoreHeaders() {
  return {
    "Cache-Control": "no-store, max-age=0",
  };
}
