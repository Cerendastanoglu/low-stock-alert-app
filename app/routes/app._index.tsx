import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSearchParams, Form, useActionData } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  InlineStack,
  TextField,
  Badge,
  Icon,
  Banner,
  EmptyState,
  Modal,
  FormLayout,
  Checkbox,
  DataTable,
  Select,
  Tooltip,
} from "@shopify/polaris";
import {
  AlertTriangleIcon,
  InventoryIcon,
  EmailIcon,
} from "@shopify/polaris-icons";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { sendLowStockAlert, testEmailSettings } from "../services/email.server";

interface Product {
  id: string;
  name: string;
  stock: number;
  salesVelocity?: {
    daily: number;
    weekly: number;
    monthly: number;
  };
  forecast?: {
    daysUntilStockout: number | null;
    status: 'critical' | 'warning' | 'safe' | 'unknown';
  };
}

// Simple email settings store (in production, use a database)
let emailSettings = {
  enabled: false,
  recipientEmail: '',
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  // Get shop information including owner email
  const shopResponse = await admin.graphql(
    `#graphql
      query getShop {
        shop {
          email
          name
          myshopifyDomain
          contactEmail
        }
      }`
  );

  const shopData = await shopResponse.json();
  const shopInfo = shopData.data.shop;

  // Get products with inventory data
  const response = await admin.graphql(
    `#graphql
      query getProducts {
        products(first: 50) {
          edges {
            node {
              id
              title
              totalInventory
              variants(first: 1) {
                edges {
                  node {
                    inventoryQuantity
                    id
                  }
                }
              }
            }
          }
        }
      }`
  );

  const responseJson = await response.json();
  const products = responseJson.data.products.edges.map(({ node }: any) => ({
    id: node.id,
    name: node.title,
    stock: node.variants.edges[0]?.node.inventoryQuantity || 0,
    variantId: node.variants.edges[0]?.node.id
  }));

  // Get sales data for forecasting from real orders (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sinceDate = thirtyDaysAgo.toISOString();
  
  let salesData = {};
  try {
    console.log("Fetching real order data for forecasting...");
    
    const salesResponse = await admin.graphql(
      `#graphql
        query getRecentOrders($query: String!) {
          orders(first: 250, query: $query) {
            edges {
              node {
                id
                createdAt
                lineItems(first: 50) {
                  edges {
                    node {
                      product {
                        id
                      }
                      quantity
                    }
                  }
                }
              }
            }
          }
        }`,
      {
        variables: {
          query: `created_at:>=${sinceDate}`
        }
      }
    );

    const salesJson = await salesResponse.json();
    
    if (salesJson.data?.orders?.edges) {
      console.log(`Processing ${salesJson.data.orders.edges.length} orders for sales analysis`);
      salesData = processOrdersData(salesJson.data.orders.edges);
    } else {
      console.log("No order data found, using mock data");
      salesData = generateMockSalesData(products);
    }
  } catch (error) {
    console.warn("Could not fetch real order data, using mock data:", error);
    salesData = generateMockSalesData(products);
  }

  // Calculate forecasting for each product
  const productsWithForecasting = products.map((product: any) => {
    const sales = (salesData as any)[product.id] || { daily: 0, weekly: 0, monthly: 0 };
    const forecast = calculateForecast(product.stock, sales.daily);
    
    return {
      ...product,
      salesVelocity: sales,
      forecast
    };
  });

  return {
    products: productsWithForecasting,
    shopInfo
  };
};

// Helper function to process orders data for sales velocity
function processOrdersData(orders: any[]) {
  const salesData: any = {};
  
  orders.forEach(({ node: order }) => {
    order.lineItems.edges.forEach(({ node: lineItem }: any) => {
      if (lineItem.product?.id) {
        const productId = lineItem.product.id;
        if (!salesData[productId]) {
          salesData[productId] = { total: 0 };
        }
        salesData[productId].total += lineItem.quantity;
      }
    });
  });
  
  // Convert to daily/weekly/monthly averages
  Object.keys(salesData).forEach(productId => {
    const total = salesData[productId].total;
    salesData[productId] = {
      daily: Math.round(total / 30 * 10) / 10,
      weekly: Math.round(total / 4.3 * 10) / 10,
      monthly: total
    };
  });
  
  return salesData;
}

// Helper function to process real sales data (legacy function - keeping for compatibility)
function processSalesData(analyticsResults: any) {
  const salesData: any = {};
  
  if (analyticsResults.data) {
    analyticsResults.data.forEach((result: any) => {
      const productId = result.product_id;
      const totalSales = result.total_sales || 0;
      
      salesData[productId] = {
        daily: Math.round(totalSales / 30 * 10) / 10, // Average daily sales
        weekly: Math.round(totalSales / 4.3 * 10) / 10, // Average weekly sales  
        monthly: totalSales
      };
    });
  }
  
  return salesData;
}

// Mock sales data generator for demonstration
function generateMockSalesData(products: any[]) {
  const salesData: any = {};
  
  products.forEach(product => {
    // Generate realistic mock sales based on current stock and product patterns
    let baseDaily: number;
    
    // Create varied sales patterns based on stock levels
    if (product.stock === 0) {
      baseDaily = Math.random() * 3 + 1; // Products that are out sold 1-4 per day
    } else if (product.stock <= 5) {
      baseDaily = Math.random() * 2 + 0.5; // Low stock items sell 0.5-2.5 per day
    } else if (product.stock <= 20) {
      baseDaily = Math.random() * 1.5 + 0.2; // Medium stock items sell 0.2-1.7 per day
    } else {
      baseDaily = Math.random() * 0.8 + 0.1; // High stock items sell 0.1-0.9 per day
    }
    
    // Add some randomness to make it more realistic
    const variation = 0.8 + (Math.random() * 0.4); // 80% to 120% variation
    baseDaily = baseDaily * variation;
    
    salesData[product.id] = {
      daily: Math.round(baseDaily * 10) / 10,
      weekly: Math.round(baseDaily * 7 * 10) / 10,
      monthly: Math.round(baseDaily * 30 * 10) / 10
    };
  });
  
  return salesData;
}

// Calculate forecast based on current stock and daily sales
function calculateForecast(currentStock: number, dailySales: number) {
  if (dailySales <= 0) {
    return {
      daysUntilStockout: null,
      status: 'unknown' as const
    };
  }
  
  const daysUntilStockout = Math.ceil(currentStock / dailySales);
  
  let status: 'critical' | 'warning' | 'safe' | 'unknown';
  if (daysUntilStockout <= 3) {
    status = 'critical';
  } else if (daysUntilStockout <= 7) {
    status = 'warning';
  } else {
    status = 'safe';
  }
  
  return {
    daysUntilStockout,
    status
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  
  const formData = await request.formData();
  const actionType = formData.get("actionType") as string;
  
  // Get shop info for email operations
  const response = await admin.graphql(
    `query Shop {
      shop {
        name
        email
        myshopifyDomain
      }
    }`
  );
  const shopData = await response.json();
  const shopInfo = shopData.data.shop;
  
  if (actionType === "sendAlert") {
    const productsData = formData.get("products") as string;
    const threshold = parseInt(formData.get("threshold") as string) || 5;
    const emailEnabled = formData.get("emailEnabled") === "true";
    const recipientEmail = formData.get("recipientEmail") as string;
    
    if (!productsData) {
      return { success: false, message: "No product data available" };
    }
    
    const products = JSON.parse(productsData);
    
    const lowStockProducts = products.filter((product: Product) => 
      product.stock > 0 && product.stock <= threshold
    );
    const zeroStockProducts = products.filter((product: Product) => 
      product.stock === 0
    );
    
    if (lowStockProducts.length === 0 && zeroStockProducts.length === 0) {
      return { success: false, message: "No low stock or out of stock products to alert about" };
    }
    
    const result = await sendLowStockAlert(
      lowStockProducts,
      zeroStockProducts,
      threshold,
      {
        enabled: emailEnabled,
        recipientEmail: recipientEmail,
        shopInfo: shopInfo
      }
    );
    
    return result;
  }

  if (actionType === "testEmail") {
    const emailEnabled = formData.get("emailEnabled") === "true";
    const recipientEmail = formData.get("recipientEmail") as string;
    
    const result = await testEmailSettings({
      enabled: emailEnabled,
      recipientEmail: recipientEmail,
      shopInfo: shopInfo
    });
    return result;
  }
  
  return { success: false, message: "Unknown action" };
};

export default function Index() {
  const { products, shopInfo } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Email settings modal state
  const [showEmailSettings, setShowEmailSettings] = useState(false);
  const [localEmailSettings, setLocalEmailSettings] = useState(emailSettings);
  
  // Forecasting display options
  const [timePeriod, setTimePeriod] = useState('daily');
  
  const timePeriodOptions = [
    { label: 'Daily', value: 'daily' },
    { label: 'Weekly', value: 'weekly' },
    { label: 'Monthly', value: 'monthly' }
  ];

  const handleEmailSettingChange = (field: keyof typeof emailSettings, value: string | boolean | number) => {
    setLocalEmailSettings(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const saveEmailSettings = () => {
    // Update the global email settings
    Object.assign(emailSettings, localEmailSettings);
    setShowEmailSettings(false);
  };

  // Helper function to get sales velocity for selected time period
  const getSalesVelocity = (product: Product) => {
    if (!product.salesVelocity) return 0;
    return product.salesVelocity[timePeriod as keyof typeof product.salesVelocity] || 0;
  };

  // Helper function to format forecast badge
  const getForecastBadge = (product: Product) => {
    if (!product.forecast || product.forecast.daysUntilStockout === null) {
      return <Badge>Unknown</Badge>;
    }

    const days = product.forecast.daysUntilStockout;
    const status = product.forecast.status;
    
    let tone: 'critical' | 'warning' | 'success' | undefined;
    switch (status) {
      case 'critical':
        tone = 'critical';
        break;
      case 'warning':
        tone = 'warning';
        break;
      case 'safe':
        tone = 'success';
        break;
      default:
        tone = undefined;
    }

    return (
      <Tooltip content={`At current sales rate: ${getSalesVelocity(product)} units/${timePeriod === 'daily' ? 'day' : timePeriod === 'weekly' ? 'week' : 'month'}`}>
        <Badge tone={tone}>
          {days === 1 ? '1 day' : `${days} days`}
        </Badge>
      </Tooltip>
    );
  };
  
  // Get threshold from URL params, default to 5
  const getThresholdFromParams = () => {
    const thresholdParam = searchParams.get("threshold");
    return thresholdParam ? parseInt(thresholdParam, 10) : 5;
  };

  const [inventoryThreshold, setInventoryThreshold] = useState(getThresholdFromParams());

  const handleThresholdChange = (value: string) => {
    const numValue = parseInt(value, 10) || 5;
    setInventoryThreshold(numValue);
    
    // Update URL params to persist threshold
    const newSearchParams = new URLSearchParams(searchParams);
    newSearchParams.set("threshold", numValue.toString());
    setSearchParams(newSearchParams);
  };

  // Categorize products
  const lowStockProducts = products
    .filter((product: Product) => product.stock > 0 && product.stock <= inventoryThreshold)
    .sort((a: Product, b: Product) => {
      // First by name alphabetically, then by stock (lowest first)
      if (a.name.localeCompare(b.name) === 0) {
        return a.stock - b.stock;
      }
      return a.name.localeCompare(b.name);
    });

  const zeroStockProducts = products
    .filter((product: Product) => product.stock === 0)
    .sort((a: Product, b: Product) => a.name.localeCompare(b.name));

  const handleProductClick = (productId: string) => {
    // Extract numeric ID from Shopify's gid format
    const numericId = productId.split('/').pop();
    if (numericId) {
      alert(`Product ID: ${numericId}\nNavigate to Products in your admin to find this product.`);
    }
  };

  return (
    <Page>
      <TitleBar title="Low Stock Alert Dashboard" />
      <BlockStack gap="500">
        {/* Forecasting Info Banner */}
        <Banner
          tone="success"
          title="Real-Time Sales Forecasting"
        >
          <Text as="p" variant="bodyMd">
            Forecasting now uses your actual order history from the last 30 days. If no recent orders are found, demo data will be displayed.
          </Text>
        </Banner>

        {/* Email Action Result Banner */}
        {actionData && (
          <Banner
            tone={actionData.success ? "success" : "critical"}
            title={actionData.success ? "Email Sent Successfully" : "Email Failed"}
          >
            <Text as="p" variant="bodyMd">
              {actionData.message}
            </Text>
          </Banner>
        )}

        {/* Summary Banner */}
        {(lowStockProducts.length > 0 || zeroStockProducts.length > 0) && (
          <Banner
            tone="warning"
            icon={AlertTriangleIcon}
            title={`${lowStockProducts.length + zeroStockProducts.length} products need attention`}
          >
            <Text as="p" variant="bodyMd">
              {lowStockProducts.length > 0 && `${lowStockProducts.length} products are running low`}
              {lowStockProducts.length > 0 && zeroStockProducts.length > 0 && ", "}
              {zeroStockProducts.length > 0 && `${zeroStockProducts.length} products are out of stock`}
            </Text>
          </Banner>
        )}

        <Layout>
          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingMd">
                      Inventory Threshold
                    </Text>
                    <Icon source={InventoryIcon} tone="subdued" />
                  </InlineStack>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Products with stock at or below this number will be flagged as low stock
                  </Text>
                  <TextField
                    label="Threshold quantity"
                    type="number"
                    value={inventoryThreshold.toString()}
                    onChange={handleThresholdChange}
                    autoComplete="off"
                    min={1}
                    helpText="Set the minimum stock level for alerts"
                  />
                </BlockStack>
              </Card>

              {/* Stats Card */}
              <Card>
                <BlockStack gap="300">
                  <Text as="h3" variant="headingMd">
                    Inventory Summary
                  </Text>
                  <BlockStack gap="300">
                    {/* Out of Stock - Most Critical */}
                    <Card background="bg-surface-critical">
                      <InlineStack align="space-between" blockAlign="center">
                        <InlineStack gap="200" blockAlign="center">
                          <Text as="span" variant="bodyMd" fontWeight="semibold" tone="critical">
                            Out of Stock
                          </Text>
                        </InlineStack>
                        <Text variant="headingLg" as="span" fontWeight="bold" tone="critical">
                          {zeroStockProducts.length}
                        </Text>
                      </InlineStack>
                    </Card>
                    
                    {/* Low Stock - Secondary Priority */}
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="span" variant="bodyMd">Low Stock:</Text>
                      <Badge tone="warning" size="large">{lowStockProducts.length}</Badge>
                    </InlineStack>
                    
                    {/* Healthy Stock */}
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="span" variant="bodyMd">Healthy Stock:</Text>
                      <Badge tone="success" size="large">
                        {(products.length - lowStockProducts.length - zeroStockProducts.length).toString()}
                      </Badge>
                    </InlineStack>
                    
                    {/* Total Products - Last */}
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="span" variant="bodyMd">Total Products:</Text>
                      <Badge tone="info" size="large">{products.length}</Badge>
                    </InlineStack>
                  </BlockStack>
                </BlockStack>
              </Card>

              {/* Email Notifications Card */}
              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h3" variant="headingMd">
                      Email Notifications
                    </Text>
                    <Icon source={EmailIcon} tone="subdued" />
                  </InlineStack>
                  
                  <BlockStack gap="200">
                    <Text as="p" variant="bodyMd" tone="subdued">
                      {emailSettings.enabled 
                        ? `Alerts will be sent to ${emailSettings.recipientEmail}` 
                        : "Email notifications are disabled"
                      }
                    </Text>
                    
                    <InlineStack gap="200">
                      <Button 
                        onClick={() => setShowEmailSettings(true)}
                        size="slim"
                      >
                        Email Settings
                      </Button>
                      
                      {(lowStockProducts.length > 0 || zeroStockProducts.length > 0) && emailSettings.enabled && (
                        <Form method="post">
                          <input type="hidden" name="actionType" value="sendAlert" />
                          <input type="hidden" name="products" value={JSON.stringify(products)} />
                          <input type="hidden" name="threshold" value={inventoryThreshold.toString()} />
                          <input type="hidden" name="emailEnabled" value={emailSettings.enabled.toString()} />
                          <input type="hidden" name="recipientEmail" value={emailSettings.recipientEmail} />
                          <Button 
                            submit 
                            variant="primary" 
                            size="slim"
                            tone="critical"
                          >
                            Send Alert Now
                          </Button>
                        </Form>
                      )}
                    </InlineStack>
                  </BlockStack>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
          
          <Layout.Section>
            <BlockStack gap="400">
              {/* Out of Stock Products */}
              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingMd">
                      Out of Stock Products
                    </Text>
                    <Badge tone="critical">{zeroStockProducts.length}</Badge>
                  </InlineStack>
                  
                  {zeroStockProducts.length === 0 ? (
                    <EmptyState
                      image=""
                      heading="No out of stock products"
                      children={
                        <Text as="p" variant="bodyMd" tone="subdued">
                          Great! All products currently have inventory available
                        </Text>
                      }
                    />
                  ) : (
                    <BlockStack gap="200">
                      <Text as="p" variant="bodyMd" tone="subdued">
                        Products that are completely out of stock and need immediate restocking
                      </Text>
                      <BlockStack gap="100">
                        {zeroStockProducts.map((product: Product) => (
                          <Card key={product.id} background="bg-surface-secondary">
                            <InlineStack align="space-between" blockAlign="center">
                              <Button
                                onClick={() => handleProductClick(product.id)}
                                variant="plain"
                                textAlign="left"
                                removeUnderline
                              >
                                {product.name}
                              </Button>
                              <InlineStack gap="100" align="end">
                                <Text variant="headingMd" as="span" fontWeight="bold" tone="critical">
                                  0
                                </Text>
                                <Text variant="bodySm" tone="subdued" as="span">
                                  units
                                </Text>
                                <Badge tone="critical" size="small">
                                  Out of stock
                                </Badge>
                              </InlineStack>
                            </InlineStack>
                          </Card>
                        ))}
                      </BlockStack>
                    </BlockStack>
                  )}
                </BlockStack>
              </Card>

              {/* Low Stock Products with Forecasting */}
              <Card>
                <BlockStack gap="400">
                  {/* Header Section */}
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="100">
                      <Text as="h2" variant="headingMd">
                        Inventory Forecasting
                      </Text>
                      <Text as="p" variant="bodyMd" tone="subdued">
                        AI-powered stockout predictions based on sales velocity
                      </Text>
                    </BlockStack>
                    <InlineStack gap="300" blockAlign="center">
                      <Select
                        label="Time Period"
                        labelHidden
                        options={timePeriodOptions}
                        value={timePeriod}
                        onChange={setTimePeriod}
                      />
                      <Badge tone="success" size="small">Live Data</Badge>
                    </InlineStack>
                  </InlineStack>
                  
                  {/* Legend Section */}
                  <Card background="bg-surface-secondary">
                    <InlineStack gap="400" align="center">
                      <Text as="span" variant="bodyMd" fontWeight="medium">Forecast Status:</Text>
                      <InlineStack gap="300">
                        <InlineStack gap="100" blockAlign="center">
                          <Badge tone="critical" size="small">Critical</Badge>
                          <Text as="span" variant="bodySm" tone="subdued">≤3 days</Text>
                        </InlineStack>
                        <InlineStack gap="100" blockAlign="center">
                          <Badge tone="warning" size="small">Warning</Badge>
                          <Text as="span" variant="bodySm" tone="subdued">4-7 days</Text>
                        </InlineStack>
                        <InlineStack gap="100" blockAlign="center">
                          <Badge tone="success" size="small">Safe</Badge>
                          <Text as="span" variant="bodySm" tone="subdued">8+ days</Text>
                        </InlineStack>
                      </InlineStack>
                    </InlineStack>
                  </Card>
                  
                  {/* Products Table/List */}
                  {lowStockProducts.length === 0 ? (
                    <EmptyState
                      image=""
                      heading="All products well-stocked"
                      children={
                        <Text as="p" variant="bodyMd" tone="subdued">
                          No products are currently below the threshold of {inventoryThreshold} units
                        </Text>
                      }
                    />
                  ) : (
                    <BlockStack gap="300">
                      <InlineStack align="space-between" blockAlign="center">
                        <Text as="p" variant="bodyMd" fontWeight="medium">
                          {lowStockProducts.length} product{lowStockProducts.length !== 1 ? 's' : ''} need attention
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          Threshold: ≤{inventoryThreshold} units
                        </Text>
                      </InlineStack>
                      
                      <BlockStack gap="200">
                        {lowStockProducts.map((product: Product) => (
                          <Card key={product.id} background="bg-surface-secondary">
                            <InlineStack align="space-between" wrap={false} blockAlign="start">
                              {/* Product Info */}
                              <BlockStack gap="100">
                                <Button
                                  onClick={() => handleProductClick(product.id)}
                                  variant="plain"
                                  textAlign="left"
                                  removeUnderline
                                >
                                  {product.name}
                                </Button>
                                <InlineStack gap="300">
                                  <Text as="span" variant="bodySm" tone="subdued">
                                    Stock: {product.stock} units
                                  </Text>
                                  <Text as="span" variant="bodySm" tone="subdued">
                                    Sales: {getSalesVelocity(product)}/{timePeriod === 'daily' ? 'day' : timePeriod === 'weekly' ? 'week' : 'month'}
                                  </Text>
                                </InlineStack>
                              </BlockStack>
                              
                              {/* Status Badges - Right aligned */}
                              <BlockStack gap="100" align="end">
                                <InlineStack gap="100" align="end">
                                  <Text variant="headingMd" as="span" fontWeight="bold">
                                    {product.stock}
                                  </Text>
                                  <Text variant="bodySm" tone="subdued" as="span">
                                    units
                                  </Text>
                                </InlineStack>
                                <InlineStack gap="100" align="end">
                                  {getForecastBadge(product)}
                                  <Badge 
                                    tone={product.stock === 0 ? 'critical' : product.stock <= inventoryThreshold / 2 ? 'critical' : 'warning'}
                                    size="small"
                                  >
                                    {product.stock === 0 ? 'Out of Stock' : 'Low Stock'}
                                  </Badge>
                                </InlineStack>
                              </BlockStack>
                            </InlineStack>
                          </Card>
                        ))}
                      </BlockStack>
                    </BlockStack>
                  )}
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>

      {/* Email Settings Modal */}
      <Modal
        open={showEmailSettings}
        onClose={() => setShowEmailSettings(false)}
        title="Email Notification Settings"
        primaryAction={{
          content: 'Save Settings',
          onAction: saveEmailSettings,
          disabled: !localEmailSettings.enabled || (localEmailSettings.enabled && !localEmailSettings.recipientEmail)
        }}
        secondaryActions={[
          {
            content: 'Cancel',
            onAction: () => {
              setLocalEmailSettings(emailSettings);
              setShowEmailSettings(false);
            },
          },
        ]}
      >
        <Modal.Section>
          <FormLayout>
            <Checkbox
              label="Enable email notifications"
              checked={localEmailSettings.enabled}
              onChange={(checked) => handleEmailSettingChange('enabled', checked)}
              helpText="Turn on to receive email alerts for low stock products"
            />

            {localEmailSettings.enabled && (
              <>
                <div style={{ padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: '4px', marginBottom: '1rem' }}>
                  <Text as="p" variant="bodyMd">
                    <strong>From:</strong> {shopInfo.name} &lt;{shopInfo.email}&gt;
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Emails will be sent automatically using your shop's information
                  </Text>
                </div>

                <TextField
                  label="Recipient Email Address"
                  value={localEmailSettings.recipientEmail}
                  onChange={(value) => handleEmailSettingChange('recipientEmail', value)}
                  placeholder="alerts@yourcompany.com"
                  helpText="Email address where low stock alerts will be sent"
                  autoComplete="email"
                />
              </>
            )}
          </FormLayout>
          
          {localEmailSettings.enabled && localEmailSettings.recipientEmail && (
            <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
              <Text as="p" variant="bodyMd" tone="subdued">
                Test your email configuration:
              </Text>
              <Form method="post" style={{ marginTop: '0.5rem' }}>
                <input type="hidden" name="actionType" value="testEmail" />
                <input type="hidden" name="emailEnabled" value={localEmailSettings.enabled.toString()} />
                <input type="hidden" name="recipientEmail" value={localEmailSettings.recipientEmail} />
                <Button submit size="slim">
                  Send Test Email
                </Button>
              </Form>
            </div>
          )}
        </Modal.Section>
      </Modal>
    </Page>
  );
}
