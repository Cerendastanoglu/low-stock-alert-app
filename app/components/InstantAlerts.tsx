import { useState, useEffect } from "react";
import { useFetcher } from "@remix-run/react";
import {
  Banner,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Card,
  Badge,
  Icon,
  Toast,
  Frame,
} from "@shopify/polaris";
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  XSmallIcon,
  RefreshIcon,
} from "@shopify/polaris-icons";

interface AlertProduct {
  id: string;
  name: string;
  stock: number;
  status: 'critical' | 'warning' | 'out-of-stock';
  daysUntilStockout?: number;
}

interface InstantAlert {
  id: string;
  type: 'critical' | 'warning' | 'success' | 'info';
  title: string;
  message: string;
  products?: AlertProduct[];
  timestamp: Date;
  dismissed: boolean;
  action?: string;
}

export function InstantAlerts() {
  const [alerts, setAlerts] = useState<InstantAlert[]>([]);
  const [toastActive, setToastActive] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [lastCheck, setLastCheck] = useState<Date>(new Date());
  
  const fetcher = useFetcher();

  // Check for inventory alerts
  const checkInventoryAlerts = () => {
    // In a real implementation, this would fetch current inventory data
    // For now, we'll simulate some alerts
    const criticalThreshold = 2;
    const warningThreshold = 5;
    
    // Simulate fetching inventory data
    const mockInventoryData = [
      { id: "1", name: "Premium Widget Pro", stock: 0, dailySales: 2.5 },
      { id: "2", name: "Essential Tool Kit", stock: 1, dailySales: 1.2 },
      { id: "3", name: "Basic Component", stock: 3, dailySales: 0.8 },
      { id: "4", name: "Advanced Module", stock: 4, dailySales: 1.5 },
    ];

    const criticalProducts: AlertProduct[] = [];
    const warningProducts: AlertProduct[] = [];
    const outOfStockProducts: AlertProduct[] = [];

    mockInventoryData.forEach(item => {
      const daysUntilStockout = item.dailySales > 0 ? Math.ceil(item.stock / item.dailySales) : null;
      
      if (item.stock === 0) {
        outOfStockProducts.push({
          id: item.id,
          name: item.name,
          stock: item.stock,
          status: 'out-of-stock',
          daysUntilStockout: 0
        });
      } else if (item.stock <= criticalThreshold || (daysUntilStockout && daysUntilStockout <= 3)) {
        criticalProducts.push({
          id: item.id,
          name: item.name,
          stock: item.stock,
          status: 'critical',
          daysUntilStockout: daysUntilStockout || undefined
        });
      } else if (item.stock <= warningThreshold || (daysUntilStockout && daysUntilStockout <= 7)) {
        warningProducts.push({
          id: item.id,
          name: item.name,
          stock: item.stock,
          status: 'warning',
          daysUntilStockout: daysUntilStockout || undefined
        });
      }
    });

    const newAlerts: InstantAlert[] = [];
    const now = new Date();

    // Create alerts for different scenarios
    if (outOfStockProducts.length > 0) {
      newAlerts.push({
        id: `out-of-stock-${now.getTime()}`,
        type: 'critical',
        title: 'Products Out of Stock',
        message: `${outOfStockProducts.length} product${outOfStockProducts.length > 1 ? 's are' : ' is'} completely out of stock`,
        products: outOfStockProducts,
        timestamp: now,
        dismissed: false,
        action: 'restock'
      });
    }

    if (criticalProducts.length > 0) {
      newAlerts.push({
        id: `critical-${now.getTime()}`,
        type: 'critical',
        title: 'Critical Stock Levels',
        message: `${criticalProducts.length} product${criticalProducts.length > 1 ? 's need' : ' needs'} immediate attention`,
        products: criticalProducts,
        timestamp: now,
        dismissed: false,
        action: 'urgent-restock'
      });
    }

    if (warningProducts.length > 0) {
      newAlerts.push({
        id: `warning-${now.getTime()}`,
        type: 'warning',
        title: 'Low Stock Warning',
        message: `${warningProducts.length} product${warningProducts.length > 1 ? 's are' : ' is'} running low`,
        products: warningProducts,
        timestamp: now,
        dismissed: false,
        action: 'plan-restock'
      });
    }

    return newAlerts;
  };

  // Periodic check for new alerts
  useEffect(() => {
    const checkForAlerts = () => {
      const newAlerts = checkInventoryAlerts();
      
      newAlerts.forEach(newAlert => {
        setAlerts(prev => {
          // Check if similar alert already exists and is not dismissed
          const exists = prev.some(alert => 
            alert.type === newAlert.type && 
            alert.title === newAlert.title &&
            !alert.dismissed &&
            Math.abs(alert.timestamp.getTime() - newAlert.timestamp.getTime()) < 300000 // 5 minutes
          );
          
          if (!exists) {
            setToastMessage(`${newAlert.title}: ${newAlert.message}`);
            setToastActive(true);
            return [newAlert, ...prev.slice(0, 9)]; // Keep only last 10 alerts
          }
          return prev;
        });
      });
      
      setLastCheck(new Date());
    };

    // Initial check
    checkForAlerts();

    // Check every 60 seconds
    const interval = setInterval(checkForAlerts, 60000);

    return () => clearInterval(interval);
  }, []);

  const dismissAlert = (alertId: string) => {
    setAlerts(prev => 
      prev.map(alert => 
        alert.id === alertId 
          ? { ...alert, dismissed: true }
          : alert
      )
    );
  };

  const dismissAllAlerts = () => {
    setAlerts(prev => 
      prev.map(alert => ({ ...alert, dismissed: true }))
    );
  };

  const refreshAlerts = () => {
    const newAlerts = checkInventoryAlerts();
    setAlerts(newAlerts);
    setToastMessage("Alerts refreshed");
    setToastActive(true);
  };

  const activeAlerts = alerts.filter(alert => !alert.dismissed);

  const toastMarkup = toastActive ? (
    <Toast
      content={toastMessage}
      onDismiss={() => setToastActive(false)}
      duration={4000}
    />
  ) : null;

  if (activeAlerts.length === 0) {
    return (
      <Frame>
        {toastMarkup}
      </Frame>
    );
  }

  return (
    <Frame>
      {toastMarkup}
      <div style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        width: '420px',
        zIndex: 1000,
        maxHeight: '80vh',
        overflowY: 'auto',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
      }}>
        <BlockStack gap="300">
          {/* Header */}
          <Card>
            <InlineStack align="space-between" blockAlign="center">
              <InlineStack gap="200" blockAlign="center">
                <Icon source={AlertTriangleIcon} tone="critical" />
                <BlockStack gap="100">
                  <Text variant="headingSm" as="h3" fontWeight="semibold">
                    Instant Alerts ({activeAlerts.length})
                  </Text>
                  <Text variant="bodySm" as="p" tone="subdued">
                    Last check: {lastCheck.toLocaleTimeString()}
                  </Text>
                </BlockStack>
              </InlineStack>
              <InlineStack gap="100">
                <Button 
                  size="slim" 
                  variant="tertiary"
                  icon={RefreshIcon}
                  onClick={refreshAlerts}
                  accessibilityLabel="Refresh alerts"
                />
                <Button 
                  size="slim" 
                  variant="tertiary"
                  onClick={dismissAllAlerts}
                >
                  Dismiss All
                </Button>
              </InlineStack>
            </InlineStack>
          </Card>

          {/* Alert Cards */}
          {activeAlerts.slice(0, 3).map((alert) => (
            <Card key={alert.id} background={alert.type === 'critical' ? 'bg-surface-critical' : 'bg-surface-warning'}>
              <BlockStack gap="200">
                <InlineStack align="space-between" blockAlign="start">
                  <BlockStack gap="100">
                    <InlineStack gap="200" blockAlign="center">
                      <Badge tone={alert.type} size="small">
                        {alert.type.toUpperCase()}
                      </Badge>
                      <Text variant="bodySm" as="span" tone="subdued">
                        {alert.timestamp.toLocaleTimeString()}
                      </Text>
                    </InlineStack>
                    <Text variant="bodyMd" as="h4" fontWeight="semibold">
                      {alert.title}
                    </Text>
                    <Text variant="bodySm" as="p" tone="subdued">
                      {alert.message}
                    </Text>
                  </BlockStack>
                  <Button
                    size="slim"
                    variant="tertiary"
                    icon={XSmallIcon}
                    onClick={() => dismissAlert(alert.id)}
                    accessibilityLabel="Dismiss alert"
                  />
                </InlineStack>

                {/* Product List */}
                {alert.products && alert.products.length > 0 && (
                  <BlockStack gap="100">
                    <Text variant="bodySm" as="p" fontWeight="medium">
                      Affected Products:
                    </Text>
                    {alert.products.slice(0, 3).map((product) => (
                      <InlineStack key={product.id} align="space-between" blockAlign="center">
                        <BlockStack gap="100">
                          <Text variant="bodySm" as="span">
                            {product.name}
                          </Text>
                          {product.daysUntilStockout !== undefined && product.daysUntilStockout > 0 && (
                            <Text variant="bodySm" as="span" tone="subdued">
                              ~{product.daysUntilStockout} days until stockout
                            </Text>
                          )}
                        </BlockStack>
                        <InlineStack gap="100" blockAlign="center">
                          <Text variant="bodySm" as="span" fontWeight="semibold">
                            {product.stock} units
                          </Text>
                          <Badge 
                            tone={product.status === 'out-of-stock' ? 'critical' : product.status === 'critical' ? 'critical' : 'warning'} 
                            size="small"
                          >
                            {product.status === 'out-of-stock' ? 'Out' : product.status === 'critical' ? 'Critical' : 'Low'}
                          </Badge>
                        </InlineStack>
                      </InlineStack>
                    ))}
                    {alert.products.length > 3 && (
                      <Text variant="bodySm" as="p" tone="subdued">
                        +{alert.products.length - 3} more products
                      </Text>
                    )}
                  </BlockStack>
                )}

                {/* Action Buttons */}
                <InlineStack gap="200">
                  <Button size="slim" variant="primary">
                    View Dashboard
                  </Button>
                  <Button size="slim" variant="secondary">
                    {alert.action === 'restock' ? 'Restock Now' : 
                     alert.action === 'urgent-restock' ? 'Urgent Action' : 
                     'Plan Restock'}
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          ))}

          {/* Show more indicator */}
          {activeAlerts.length > 3 && (
            <Card>
              <InlineStack align="center">
                <Text variant="bodySm" as="p" tone="subdued">
                  +{activeAlerts.length - 3} more alerts
                </Text>
              </InlineStack>
            </Card>
          )}
        </BlockStack>
      </div>
    </Frame>
  );
}
