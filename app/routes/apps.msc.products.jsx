import { authenticate } from "../shopify.server";
import { jsonResponse } from "../lib/msc.server";

const MSC_CATALOG_PRODUCTS = `#graphql
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
`;

export async function loader({ request }) {
  console.log("[MSC products] loader started");

  try {
    const context = await authenticate.public.appProxy(request);
    const { admin } = context;

    console.log("[MSC products] app proxy authenticated", {
      hasAdmin: Boolean(admin),
      hasSession: Boolean(context.session),
    });

    if (!admin) {
      console.error("[MSC products] admin session missing");
      return jsonResponse(
        {
          ok: false,
          error:
            "No se pudo autenticar la tienda. Verifique que la aplicación esté instalada.",
        },
        401,
      );
    }

    console.log("[MSC products] running GraphQL query MscCatalogProducts");
    const response = await admin.graphql(MSC_CATALOG_PRODUCTS);
    const result = await response.json();

    if (Array.isArray(result.errors) && result.errors.length > 0) {
      console.error("[MSC products] GraphQL errors:", result.errors);

      return jsonResponse(
        {
          ok: false,
          error: "Shopify rechazó la consulta de productos.",
          errors: result.errors.map((error) => ({
            message: error.message,
          })),
        },
        502,
      );
    }

    const data = result?.data;

    if (!data?.products?.nodes) {
      console.error("[MSC products] invalid GraphQL response:", result);

      return jsonResponse(
        {
          ok: false,
          error: "Shopify devolvió una respuesta incompleta.",
        },
        502,
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
          imageAlt: product.featuredImage?.altText || product.title,
          price: Number(variant.price || 0),
          compareAtPrice: Number(variant.compareAtPrice || 0),
          currency: currencyCode,
          promotion: product.promotion?.value === "true",
          clicks: Number(product.clicks?.value || 0),
          availableForSale: Boolean(variant.availableForSale),
        };
      })
      .filter(Boolean);

    products.sort((a, b) => {
      const promotionOrder = Number(b.promotion) - Number(a.promotion);

      if (promotionOrder !== 0) {
        return promotionOrder;
      }

      return b.clicks - a.clicks;
    });

    console.log("[MSC products] returning products", {
      count: products.length,
      currency: currencyCode,
    });

    return jsonResponse(
      {
        ok: true,
        products,
      },
      200,
    );
  } catch (error) {
    console.error("[MSC products] loader error:", error);

    if (error instanceof Response) {
      let body = "";

      try {
        body = await error.clone().text();
      } catch (bodyError) {
        console.error("No se pudo leer el cuerpo del error:", bodyError);
      }

      console.error("MSC thrown response status:", error.status, body);

      return jsonResponse(
        {
          ok: false,
          error: `Shopify devolvió un error ${error.status}.`,
          details: body || error.statusText,
        },
        error.status || 500,
      );
    }

    return jsonResponse(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudieron cargar los productos.",
      },
      500,
    );
  }
}
