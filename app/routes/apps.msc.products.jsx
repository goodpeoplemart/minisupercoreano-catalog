import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  try {
    const { admin } = await authenticate.public.appProxy(request);

    if (!admin) {
      return json(
        {
          ok: false,
          error:
            "No se pudo autenticar la tienda. Verifique que la aplicación esté instalada.",
        },
        {
          status: 401,
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    const response = await admin.graphql(`
      #graphql
      query MscCatalogProducts {
        products(
          first: 100
          query: "status:active"
          sortKey: UPDATED_AT
          reverse: true
        ) {
          nodes {
            id
            title
            descriptionHtml

            featuredImage {
              url
              altText
            }

            promotion: metafield(
              namespace: "custom"
              key: "promotion"
            ) {
              value
            }

            clicks: metafield(
              namespace: "custom"
              key: "catalog_clicks"
            ) {
              value
            }

            variants(first: 1) {
              nodes {
                id
                availableForSale
                price
                compareAtPrice
              }
            }
          }
        }

        shop {
          currencyCode
        }
      }
    `);

    const result = await response.json();

    if (Array.isArray(result.errors) && result.errors.length > 0) {
      console.error("MSC product GraphQL errors:", result.errors);

      return json(
        {
          ok: false,
          error: "Shopify rechazó la consulta de productos.",
          errors: result.errors.map((error) => ({
            message: error.message,
          })),
        },
        {
          status: 502,
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    const data = result?.data;

    if (!data?.products?.nodes) {
      console.error("MSC invalid GraphQL response:", result);

      return json(
        {
          ok: false,
          error: "Shopify devolvió una respuesta incompleta.",
        },
        {
          status: 502,
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    const currencyCode = data.shop?.currencyCode || "MXN";

    const products = data.products.nodes
      .map((product) => {
        const variant = product.variants?.nodes?.[0];

        if (!variant) {
          return null;
        }

        return {
          id: product.id,
          variantId: variant.id,
          title: product.title,
          descriptionHtml: product.descriptionHtml || "",
          image: product.featuredImage?.url || "",
          imageAlt:
            product.featuredImage?.altText ||
            product.title,
          price: Number(variant.price || 0),
          compareAtPrice: Number(
            variant.compareAtPrice || 0,
          ),
          currency: currencyCode,
          promotion:
            product.promotion?.value === "true",
          clicks: Number(
            product.clicks?.value || 0,
          ),
          availableForSale: Boolean(
            variant.availableForSale,
          ),
        };
      })
      .filter(Boolean)
      .filter(
        (product) => product.availableForSale,
      );

    products.sort((a, b) => {
      const promotionOrder =
        Number(b.promotion) -
        Number(a.promotion);

      if (promotionOrder !== 0) {
        return promotionOrder;
      }

      return b.clicks - a.clicks;
    });

    return json(
      {
        ok: true,
        products,
      },
      {
        status: 200,
        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate",
        },
      },
    );
  } catch (error) {
    console.error(
      "MSC products route error:",
      error,
    );

    return json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudieron cargar los productos.",
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}