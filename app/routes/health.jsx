import { jsonResponse } from "../lib/msc.server";

export async function loader() {
  return jsonResponse({
    ok: true,
    service: "minisupercoreano-catalog",
  });
}
