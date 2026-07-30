import { authenticate } from "../shopify.server";
import {
  buildOrderEmailHtml,
  buildOrderEmailText,
  formatOrderDateTime,
  generateOrderNumber,
  jsonResponse,
  logOrderEmailConfiguration,
  sendOrderEmail,
} from "../lib/msc.server";

/**
 * Email-only order endpoint (App Proxy POST):
 * Storefront: /apps/msc/order
 *
 * Flow: validate → verify variants (GraphQL) → order number → send email
 */

const VERIFY_VARIANTS = `#graphql
  query MscVerifyOrderVariants($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on ProductVariant {
        id
        title
        price
        availableForSale
        product {
          id
          title
        }
      }
    }
  }
`;

export async function loader() {
  return jsonResponse(
    { ok: false, error: "METHOD_NOT_ALLOWED", message: "Método no permitido." },
    405,
  );
}

export async function action({ request }) {
  console.log("[ORDER SERVER] Request received");

  if (request.method !== "POST") {
    return jsonResponse(
      { ok: false, error: "METHOD_NOT_ALLOWED", message: "Método no permitido." },
      405,
    );
  }

  let admin;

  try {
    const auth = await authenticate.public.appProxy(request);
    admin = auth.admin;
  } catch (error) {
    console.error("[ORDER] App proxy authentication failed", error);
    return jsonResponse(
      {
        ok: false,
        error: "AUTH_FAILED",
        message: "No se pudo enviar el pedido.",
      },
      401,
    );
  }

  if (!admin) {
    console.error("[ORDER] Admin session unavailable");
    return jsonResponse(
      {
        ok: false,
        error: "AUTH_FAILED",
        message: "No se pudo enviar el pedido.",
      },
      401,
    );
  }

  let payload;

  try {
    payload = await request.json();
  } catch (error) {
    console.error("[ORDER SERVER] Invalid JSON", error);
    return jsonResponse(
      {
        ok: false,
        error: "INVALID_JSON",
        message: "Solicitud inválida.",
      },
      400,
    );
  }

  const { buyer: rawBuyer, items, subtotal, total } = payload;
  const buyerInput = rawBuyer ?? payload.customer;

  if (!buyerInput || !Array.isArray(items) || items.length === 0) {
    console.error("[ORDER SERVER] Missing buyer or items", {
      hasBuyer: Boolean(buyerInput),
      itemCount: Array.isArray(items) ? items.length : 0,
    });
    return jsonResponse(
      {
        ok: false,
        error: "INVALID_ORDER_DATA",
        message: "Faltan datos del pedido.",
      },
      400,
    );
  }

  const body = {
    buyer: buyerInput,
    items,
    subtotal,
    total,
    currency: payload.currency,
  };

  const validationErrors = validateOrder(body);

  if (validationErrors.length) {
    console.error("[ORDER SERVER] Buyer or items validation failed", {
      errorCount: validationErrors.length,
      fields: validationErrors.map((entry) => entry.field),
    });
    return invalidOrderData();
  }

  console.log("[ORDER SERVER] Buyer validated");
  console.log("[ORDER SERVER] Items validated", { itemCount: items.length });

  const buyer = sanitizeBuyer(body.buyer);
  const currency = normalizeCurrency(body.currency);
  const verification = await verifyOrderItems(admin, body.items);

  if (!verification.ok) {
    console.error("[ORDER] Item verification failed", {
      error: verification.error,
      errorCount: verification.errors?.length || 0,
    });
    return invalidOrderData();
  }

  const verifiedItems = verification.items;
  const orderNumber = generateOrderNumber();
  console.log("[ORDER SERVER] Order number generated", { orderNumber });

  logOrderEmailConfiguration();

  const orderedAt = formatOrderDateTime();
  const verifiedSubtotal = calculateVerifiedTotal(verifiedItems);
  const orderSubtotal = Number.isFinite(Number(subtotal))
    ? Number(subtotal)
    : verifiedSubtotal;
  const orderTotal = Number.isFinite(Number(total)) ? Number(total) : verifiedSubtotal;
  const totalQuantity = verifiedItems.reduce(
    (sum, item) => sum + item.quantity,
    0,
  );

  console.log("[ORDER SERVER] Sending email");

  try {
    await sendOrderEmail({
      subject: `PEDIDO - ${orderNumber}`,
      html: buildOrderEmailHtml({
        orderNumber,
        customer: buyer,
        items: verifiedItems,
        currencyCode: currency,
        subtotal: orderTotal,
        uniqueProducts: verifiedItems.length,
        totalQuantity,
        orderedAt,
      }),
      text: buildOrderEmailText({
        orderNumber,
        customer: buyer,
        items: verifiedItems,
        currencyCode: currency,
        subtotal: orderTotal,
        uniqueProducts: verifiedItems.length,
        totalQuantity,
        orderedAt,
      }),
    });
  } catch (error) {
    console.error("[ORDER SERVER] Email send failed", error);
    return emailSendFailed();
  }

  console.log("[ORDER SERVER] Email sent successfully", { orderNumber });

  await sendOptionalWebhook({
    event: "msc.order.created",
    createdAt: new Date().toISOString(),
    orderNumber,
    total: orderTotal,
    currency,
    buyer,
    items: verifiedItems.map((item) => ({
      productId: item.productId,
      variantId: item.variantId,
      title: item.title,
      price: item.unitPrice,
      quantity: item.quantity,
      total: item.subtotal,
    })),
  });

  return jsonResponse({
    ok: true,
    orderNumber,
  });
}

function invalidOrderData(message = "Verifica los datos del pedido.") {
  return jsonResponse(
    {
      ok: false,
      error: "INVALID_ORDER_DATA",
      message,
    },
    400,
  );
}

function emailSendFailed() {
  return jsonResponse(
    {
      ok: false,
      error: "EMAIL_SEND_FAILED",
      message: "No se pudo enviar el pedido.",
    },
    500,
  );
}

async function verifyOrderItems(admin, items) {
  const normalizedItems = Array.isArray(items) ? items : [];

  if (!normalizedItems.length) {
    return {
      ok: false,
      error: "La lista de productos está vacía.",
      errors: [{ field: "items", message: "La lista de productos está vacía." }],
    };
  }

  const variantIds = normalizedItems.map((item) =>
    normalizeVariantGid(item?.variantId),
  );

  if (variantIds.some((variantId) => !variantId)) {
    return {
      ok: false,
      error: "Uno o más productos no tienen variante válida.",
      errors: [{ field: "items", message: "Variante de producto inválida." }],
    };
  }

  let result;

  try {
    const response = await admin.graphql(VERIFY_VARIANTS, {
      variables: { ids: variantIds },
    });

    result = await response.json();
  } catch (error) {
    console.error("[ORDER] Item verification GraphQL request failed", error);
    return {
      ok: false,
      error: "No se pudieron verificar los productos del pedido.",
    };
  }

  const graphqlErrors = Array.isArray(result?.errors) ? result.errors : [];

  if (graphqlErrors.length) {
    console.error("[ORDER] Item verification GraphQL errors", graphqlErrors);
    return {
      ok: false,
      error: "No se pudieron verificar los productos del pedido.",
    };
  }

  const nodes = Array.isArray(result?.data?.nodes) ? result.data.nodes : [];
  const variantsById = new Map(
    nodes.filter((node) => node?.id).map((node) => [node.id, node]),
  );
  const verifiedItems = [];
  const errors = [];

  normalizedItems.forEach((item, index) => {
    const variantId = normalizeVariantGid(item?.variantId);
    const variant = variantsById.get(variantId);
    const quantity = normalizeQuantity(item?.quantity);

    if (!variant) {
      errors.push({
        field: `items.${index}.variantId`,
        message: "Producto no encontrado en Shopify.",
      });
      return;
    }

    if (!variant.availableForSale) {
      errors.push({
        field: `items.${index}.variantId`,
        message: "Producto no disponible.",
      });
      return;
    }

    if (quantity < 1) {
      errors.push({
        field: `items.${index}.quantity`,
        message: "Cantidad inválida.",
      });
      return;
    }

    const unitPrice = Number(variant.price);

    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      errors.push({
        field: `items.${index}.price`,
        message: "Precio inválido.",
      });
      return;
    }

    verifiedItems.push({
      productId: variant.product?.id || cleanText(item.productId, 250),
      variantId: variant.id,
      title: cleanText(variant.product?.title || item.title, 250),
      quantity,
      unitPrice,
      subtotal: unitPrice * quantity,
    });
  });

  if (errors.length) {
    return {
      ok: false,
      error: "Los productos del pedido no son válidos.",
      errors,
    };
  }

  return { ok: true, items: verifiedItems };
}

function calculateVerifiedTotal(items) {
  return (Array.isArray(items) ? items : []).reduce(
    (sum, item) => sum + item.subtotal,
    0,
  );
}

function validateOrder(body) {
  const errors = [];
  const buyer = body?.buyer ?? body?.customer ?? {};
  const items = Array.isArray(body?.items) ? body.items : [];

  if (!cleanText(buyer.name, 150)) {
    errors.push({ field: "buyer.name", message: "Nombre requerido." });
  }

  if (!digitsOnly(buyer.phone)) {
    errors.push({ field: "buyer.phone", message: "Teléfono requerido." });
  }

  if (!cleanText(buyer.address, 250)) {
    errors.push({ field: "buyer.address", message: "Dirección requerida." });
  }

  if (!cleanText(buyer.exteriorNumber, 50)) {
    errors.push({
      field: "buyer.exteriorNumber",
      message: "Número exterior requerido.",
    });
  }

  if (!cleanText(buyer.colonia, 150)) {
    errors.push({ field: "buyer.colonia", message: "Colonia requerida." });
  }

  if (!cleanText(buyer.municipality, 150)) {
    errors.push({
      field: "buyer.municipality",
      message: "Alcaldía o municipio requerido.",
    });
  }

  if (!cleanText(buyer.state, 150)) {
    errors.push({ field: "buyer.state", message: "Estado requerido." });
  }

  if (!/^\d{5}$/.test(String(buyer.postalCode || "").trim())) {
    errors.push({
      field: "buyer.postalCode",
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

    if (normalizePrice(item?.unitPrice ?? item?.price) < 0) {
      errors.push({
        field: `items.${index}.price`,
        message: "Precio inválido.",
      });
    }
  });

  return errors;
}

function sanitizeBuyer(raw = {}) {
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
    reference: cleanText(raw.reference, 500),
    comments: cleanText(raw.comments, 1000),
  };
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
    console.error("[ORDER] Notification webhook failed", error);
    return {
      enabled: true,
      sent: false,
      message: error.message || "Webhook error.",
    };
  }
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
