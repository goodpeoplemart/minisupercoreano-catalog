import { authenticate } from "../shopify.server";
import { graphqlJson, jsonResponse } from "../lib/msc.server";

export async function action({ request }) {
  if (request.method !== "POST") {
    return jsonResponse(
      {
        error: "Método no permitido.",
      },
      405,
    );
  }

  try {
    const { admin } = await authenticate.public.appProxy(request);

    if (!admin) {
      return jsonResponse(
        {
          error: "No se pudo autenticar la tienda.",
        },
        401,
      );
    }

    const body = await request.json();
    const productId = String(body.productId || "");

    if (!productId.startsWith("gid://shopify/Product/")) {
      return jsonResponse(
        {
          error: "Producto inválido.",
        },
        400,
      );
    }

    const productResponse = await admin.graphql(
      `
        #graphql
        query MscProductClicks($id: ID!) {
          product(id: $id) {
            id
            clicks: metafield(
              namespace: "custom"
              key: "catalog_clicks"
            ) {
              value
            }
          }
        }
      `,
      {
        variables: {
          id: productId,
        },
      },
    );

    const productData = await graphqlJson(productResponse);

    if (!productData.product) {
      return jsonResponse(
        {
          error: "Producto no encontrado.",
        },
        404,
      );
    }

    const currentClicks = Number(
      productData.product.clicks?.value || 0,
    );

    const nextClicks = currentClicks + 1;

    const updateResponse = await admin.graphql(
      `
        #graphql
        mutation MscSetProductClicks(
          $metafields: [MetafieldsSetInput!]!
        ) {
          metafieldsSet(metafields: $metafields) {
            metafields {
              id
              namespace
              key
              value
            }
            userErrors {
              field
              message
            }
          }
        }
      `,
      {
        variables: {
          metafields: [
            {
              ownerId: productId,
              namespace: "custom",
              key: "catalog_clicks",
              type: "number_integer",
              value: String(nextClicks),
            },
          ],
        },
      },
    );

    const updateData = await graphqlJson(updateResponse);
    const userErrors =
      updateData.metafieldsSet?.userErrors || [];

    if (userErrors.length > 0) {
      throw new Error(
        userErrors.map((error) => error.message).join("; "),
      );
    }

    return jsonResponse({
      ok: true,
      clicks: nextClicks,
    });
  } catch (error) {
    console.error("MSC click route error:", error);

    return jsonResponse(
      {
        error: "No se pudo registrar el clic.",
      },
      500,
    );
  }
}