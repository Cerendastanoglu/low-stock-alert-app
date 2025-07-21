import { Page, Layout, Card, TextField, ResourceList, ResourceItem, Text, Badge } from "@shopify/polaris";
import { useLoaderData } from "@remix-run/react";
import { LoaderFunctionArgs } from "@remix-run/node";
import { gql } from "graphql-request";
import { authenticate } from "../shopify.server";
import { useCallback, useState } from "react";

// --- Types
type LowInventoryItem = {
  productTitle: string;
  variantTitle: string;
  inventory: number;
};

// --- Loader
export async function loader({ request }: LoaderFunctionArgs) {
  const { admin } = await authenticate.admin(request);

  const url = new URL(request.url);
  const thresholdParam = url.searchParams.get("threshold");
  const threshold = thresholdParam ? parseInt(thresholdParam, 10) : 10;

  const query = gql`
    query GetProducts {
      products(first: 50) {
        edges {
          node {
            title
            variants(first: 10) {
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

  const response = await admin.graphql(query);
  const data = await response.json();

  const lowInventory: LowInventoryItem[] = [];

  for (const productEdge of data.data.products.edges) {
    const product = productEdge.node;
    for (const variantEdge of product.variants.edges) {
      const variant = variantEdge.node;
      if (variant.inventoryQuantity < threshold) {
        lowInventory.push({
          productTitle: product.title,
          variantTitle: variant.title,
          inventory: variant.inventoryQuantity,
        });
      }
    }
  }

  return { lowInventory };
}

// --- Component
export default function App() {
  const { lowInventory } = useLoaderData<typeof loader>();
  const [threshold, setThreshold] = useState("10");

  const handleThresholdChange = useCallback((value: string) => {
    setThreshold(value);
    const params = new URLSearchParams(window.location.search);
    params.set("threshold", value);
    window.location.search = params.toString(); // Reload page with new param
  }, []);

  return (
    <Page title="Low Inventory Alert">
      <Layout>
        <Layout.Section>
          <Card>
            <TextField
              label="Inventory threshold"
              type="number"
              value={threshold}
              onChange={handleThresholdChange}
              autoComplete="off"
              helpText="Only show products with inventory below this number"
            />
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <Text variant="headingMd" as="h2">
              Products with Low Inventory
            </Text>
            <ResourceList
              resourceName={{ singular: 'product', plural: 'products' }}
              items={lowInventory}
              renderItem={(item) => {
                const { productTitle, variantTitle, inventory } = item;

                return (
                  <ResourceItem
                    id={`${productTitle}-${variantTitle}`}
                    accessibilityLabel={`View details for ${productTitle}`}
                    onClick={() => {}}
                  >
                    <Text variant="bodyMd" fontWeight="bold" as={"h2"}>
                      {productTitle}
                    </Text>
                    <div>{variantTitle}</div>
                    <Badge tone={inventory <= 3 ? "critical" : "warning"}>
                      {`${inventory} in stock`}
                    </Badge>
                  </ResourceItem>
                );
              }}
            />
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
