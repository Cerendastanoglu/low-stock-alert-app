import { LoaderFunctionArgs, json } from "@remix-run/node";
import { useLoaderData, useSearchParams } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { gql } from "graphql-request";
import {
  Page,
  Card,
  TextField,
  Badge,
  BlockStack,
  InlineStack,
  Button,
  Collapsible,
  Text,
} from "@shopify/polaris";
import { useCallback, useState } from "react";

// --- Types
type LowInventoryItem = {
  productTitle: string;
  variantTitle: string;
  inventory: number;
};

type LoaderData = {
  criticalProducts: LowInventoryItem[];
  lowStockProducts: LowInventoryItem[];
  otherProducts: LowInventoryItem[];
};

// --- Loader
export async function loader({ request }: LoaderFunctionArgs) {
  const { admin } = await authenticate.admin(request);

  const url = new URL(request.url);
  const thresholdParam = url.searchParams.get("threshold");
  const threshold = thresholdParam ? parseInt(thresholdParam, 10) : 10;

  const query = gql`
    query GetProductsWithInventory($first: Int!) {
      products(first: $first) {
        edges {
          node {
            title
            variants(first: 5) {
              edges {
                node {
                  title
                  inventoryQuantity
                }
              }
            }
          }
        }
      }
    }
  `;

  const response = await admin.graphql(query, {
    variables: { first: 50 },
  });

  const result = await response.json();
  const products = result.data.products.edges.map((edge: any) => edge.node);

  const allVariants: LowInventoryItem[] = products.flatMap((product: any) =>
    product.variants.edges.map((v: any) => ({
      productTitle: product.title,
      variantTitle: v.node.title,
      inventory: v.node.inventoryQuantity,
    }))
  );

  const criticalProducts = allVariants.filter((v) => v.inventory < 2);
  const lowStockProducts = allVariants.filter((v) => v.inventory >= 5 && v.inventory <= 8);
  const otherProducts = allVariants.filter(
    (v) => (v.inventory >= 2 && v.inventory < 5) || v.inventory > 8
  );

  return json<LoaderData>({
    criticalProducts,
    lowStockProducts,
    otherProducts,
  });
}

export default function LowInventoryPage() {
  const { criticalProducts, lowStockProducts, otherProducts } = useLoaderData<LoaderData>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [threshold, setThreshold] = useState(searchParams.get("threshold") || "10");
  const [showOther, setShowOther] = useState(false);

  const handleThresholdChange = useCallback(
    (value: string) => {
      setThreshold(value);
      setSearchParams({ threshold: value });
    },
    [setSearchParams]
  );

  const renderProductRows = (
    products: LowInventoryItem[],
    badgeType: "critical" | "low" | "ok"
  ) => {
    const color = {
      critical: "critical",
      low: "warning",
      ok: "success",
    }[badgeType];

    const statusLabel = {
      critical: "Critical",
      low: "Low",
      ok: "OK",
    }[badgeType];

    return products.map((item, idx) => (
      <InlineStack key={idx} align="space-between" wrap={false}>
        <Text variant="bodyMd" as={"dd"}>{item.productTitle} - {item.variantTitle}</Text>
        <InlineStack align="end">
          <Text variant="bodyMd" fontWeight="semibold" as={"dd"}>{item.inventory}</Text>
          <Badge tone={color as any}>{statusLabel}</Badge>
        </InlineStack>
      </InlineStack>
    ));
  };

  return (
    <Page title="Low Inventory Alert Panel">
      <Card>
        <BlockStack gap="400">
          <TextField
            label="Inventory alert threshold"
            type="number"
            value={threshold}
            onChange={handleThresholdChange}
            autoComplete="off"
          />

          {criticalProducts.length > 0 && (
            <Card>
              <BlockStack gap="200">
                <Text variant="headingMd" as="h2">🔴 Critical Stock (&lt; 2)</Text>
                {renderProductRows(criticalProducts, "critical")}
              </BlockStack>
            </Card>
          )}

          {lowStockProducts.length > 0 && (
            <Card>
              <BlockStack gap="200">
                <Text variant="headingMd" as="h2">🟡 Low Stock (5–8)</Text>
                {renderProductRows(lowStockProducts, "low")}
              </BlockStack>
            </Card>
          )}

          {otherProducts.length > 0 && (
            <>
              <Button onClick={() => setShowOther(!showOther)} disclosure>
                {showOther ? "Hide other products" : "Show other products"}
              </Button>
              <Collapsible open={showOther} transition={{ duration: "200ms", timingFunction: "ease" }} id={""}>
                <Card>
                  <BlockStack gap="200">
                    <Text variant="headingMd" as="h2">🟢 Other Products</Text>
                    {renderProductRows(otherProducts, "ok")}
                  </BlockStack>
                </Card>
              </Collapsible>
            </>
          )}
        </BlockStack>
      </Card>
    </Page>
  );
}

