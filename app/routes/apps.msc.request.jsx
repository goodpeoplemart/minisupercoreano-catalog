import { jsonResponse } from "../lib/msc.server";

export { action } from "./apps.msc.order.jsx";

/**
 * Legacy App Proxy path kept for backward compatibility.
 * Storefront should prefer POST /apps/msc/order for email orders.
 */

export async function loader() {
  return jsonResponse(
    { ok: false, error: "Método no permitido." },
    405,
  );
}
