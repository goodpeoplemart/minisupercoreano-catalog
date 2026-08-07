import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  return { shop: session.shop };
};

export default function Index() {
  const { shop } = useLoaderData();
  const storeUrl = `https://${shop}`;
  const themeEditorUrl = `https://${shop}/admin/themes/current/editor`;

  return (
    <s-page heading="Mini Super Coreano">
      <s-section heading="Application connected successfully.">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            <s-text>Railway</s-text>
            <br />
            <s-text>Connected</s-text>
          </s-paragraph>
          <s-paragraph>
            <s-text>Shopify</s-text>
            <br />
            <s-text>Connected</s-text>
          </s-paragraph>
          <s-paragraph>
            <s-text>App Proxy</s-text>
            <br />
            <s-text>Connected</s-text>
          </s-paragraph>
          <s-paragraph>
            <s-text>Theme Extension</s-text>
            <br />
            <s-text>Connected</s-text>
          </s-paragraph>
        </s-stack>
      </s-section>

      <s-stack direction="inline" gap="base">
        <s-button href={storeUrl} target="_blank">
          Open Store
        </s-button>
        <s-button href={themeEditorUrl} target="_blank">
          Open Theme Editor
        </s-button>
      </s-stack>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
