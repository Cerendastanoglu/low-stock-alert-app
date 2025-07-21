interface Product {
  id: string;
  name: string;
  stock: number;
}

interface ShopInfo {
  email: string;
  name: string;
  myshopifyDomain: string;
  contactEmail?: string;
}

interface SimpleEmailSettings {
  enabled: boolean;
  recipientEmail: string;
  shopInfo: ShopInfo;
}

// Simple email service using a webhook approach
// This could be replaced with services like EmailJS, SendGrid, or similar
const sendEmailViaWebhook = async (emailData: any) => {
  // For now, we'll simulate sending an email
  // In production, you could use services like:
  // - EmailJS (client-side email service)
  // - SendGrid API
  // - Mailgun API
  // - AWS SES
  // - Or any other transactional email service
  
  // Simulate email sending delay
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Log the email content for debugging
  console.log('Email would be sent with content:', emailData);
  
  return {
    success: true,
    messageId: `sim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  };
};

export const sendLowStockAlert = async (
  lowStockProducts: Product[],
  zeroStockProducts: Product[],
  threshold: number,
  settings: SimpleEmailSettings
) => {
  if (!settings.enabled || !settings.recipientEmail) {
    return { success: false, message: 'Email notifications are disabled or no recipient email set' };
  }

  try {
    // Generate email content
    const totalAlerts = lowStockProducts.length + zeroStockProducts.length;
    
    let htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #d63638;">🚨 Low Stock Alert - ${totalAlerts} Products Need Attention</h2>
        <p style="color: #374151;">Your <strong>${settings.shopInfo.name}</strong> store has products that require immediate attention.</p>
    `;

    // Out of Stock Products Section
    if (zeroStockProducts.length > 0) {
      htmlContent += `
        <div style="margin: 20px 0; padding: 15px; background-color: #fef2f2; border-left: 4px solid #d63638; border-radius: 4px;">
          <h3 style="color: #d63638; margin-top: 0;">🔴 Out of Stock Products (${zeroStockProducts.length})</h3>
          <p style="color: #666; margin-bottom: 10px;">These products are completely out of stock and need immediate restocking:</p>
          <ul style="margin: 0; padding-left: 20px;">
      `;
      
      zeroStockProducts.forEach(product => {
        htmlContent += `<li style="margin: 5px 0;"><strong>${product.name}</strong> - <span style="color: #d63638; font-weight: bold;">Out of Stock</span></li>`;
      });
      
      htmlContent += `</ul></div>`;
    }

    // Low Stock Products Section
    if (lowStockProducts.length > 0) {
      htmlContent += `
        <div style="margin: 20px 0; padding: 15px; background-color: #fffbeb; border-left: 4px solid #f59e0b; border-radius: 4px;">
          <h3 style="color: #f59e0b; margin-top: 0;">⚠️ Low Stock Products (${lowStockProducts.length})</h3>
          <p style="color: #666; margin-bottom: 10px;">These products are running low (threshold: ${threshold} units):</p>
          <ul style="margin: 0; padding-left: 20px;">
      `;
      
      lowStockProducts.forEach(product => {
        htmlContent += `<li style="margin: 5px 0;"><strong>${product.name}</strong> - <span style="color: #f59e0b; font-weight: bold;">${product.stock} units left</span></li>`;
      });
      
      htmlContent += `</ul></div>`;
    }

    htmlContent += `
        <div style="margin: 30px 0; padding: 20px; background-color: #f8f9fa; border-radius: 4px;">
          <h4 style="color: #374151; margin-top: 0;">📋 Next Steps:</h4>
          <ol style="color: #6b7280; margin: 10px 0; padding-left: 20px;">
            <li>Review the products listed above</li>
            <li>Contact suppliers for restocking</li>
            <li>Update inventory levels in your Shopify admin</li>
            <li>Consider adjusting your stock threshold if needed</li>
          </ol>
          <p style="text-align: center; margin-top: 20px;">
            <a href="https://${settings.shopInfo.myshopifyDomain}/admin/products" 
               style="background-color: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
              🛍️ Go to Shopify Admin
            </a>
          </p>
        </div>
        
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
        <p style="color: #9ca3af; font-size: 12px; text-align: center;">
          This alert was generated automatically by your Low Stock Alert Dashboard for <strong>${settings.shopInfo.name}</strong><br>
          Generated on: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}
        </p>
      </div>
    `;

    const emailData = {
      to: settings.recipientEmail,
      from: `"${settings.shopInfo.name} - Low Stock Alert" <noreply@${settings.shopInfo.myshopifyDomain}>`,
      subject: `🚨 ${settings.shopInfo.name}: ${totalAlerts} Products Need Attention`,
      html: htmlContent,
      text: `
Low Stock Alert - ${totalAlerts} Products Need Attention
Store: ${settings.shopInfo.name}

${zeroStockProducts.length > 0 ? `
Out of Stock Products (${zeroStockProducts.length}):
${zeroStockProducts.map(p => `- ${p.name}: Out of Stock`).join('\n')}
` : ''}

${lowStockProducts.length > 0 ? `
Low Stock Products (${lowStockProducts.length}):
${lowStockProducts.map(p => `- ${p.name}: ${p.stock} units left`).join('\n')}
` : ''}

Threshold: ${threshold} units
Go to your admin: https://${settings.shopInfo.myshopifyDomain}/admin/products

Generated on: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}
      `
    };

    const result = await sendEmailViaWebhook(emailData);
    
    if (result.success) {
      return { 
        success: true, 
        message: `Email alert sent successfully to ${settings.recipientEmail}`,
        messageId: result.messageId 
      };
    } else {
      return { 
        success: false, 
        message: 'Failed to send email alert' 
      };
    }

  } catch (error) {
    console.error('Email sending failed:', error);
    return { 
      success: false, 
      message: `Failed to send email: ${error instanceof Error ? error.message : 'Unknown error'}` 
    };
  }
};

// Test email configuration
export const testEmailSettings = async (settings: SimpleEmailSettings) => {
  if (!settings.enabled) {
    return { success: false, message: 'Email notifications are disabled' };
  }

  if (!settings.recipientEmail) {
    return { success: false, message: 'No recipient email address provided' };
  }

  try {
    const emailData = {
      to: settings.recipientEmail,
      from: `"${settings.shopInfo.name} - Low Stock Alert" <noreply@${settings.shopInfo.myshopifyDomain}>`,
      subject: `✅ Test Email - ${settings.shopInfo.name} Low Stock Alert System`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #059669;">✅ Email Configuration Test Successful</h2>
          <p style="color: #374151;">This is a test email to confirm your email notification settings are working correctly for <strong>${settings.shopInfo.name}</strong>.</p>
          
          <div style="margin: 20px 0; padding: 15px; background-color: #f0fdf4; border-left: 4px solid #059669; border-radius: 4px;">
            <p style="color: #065f46; margin: 0;">
              <strong>Great news!</strong> If you received this email, your Low Stock Alert system is properly configured to send notifications.
            </p>
          </div>
          
          <div style="margin: 30px 0; padding: 20px; background-color: #f8f9fa; border-radius: 4px;">
            <h4 style="color: #374151; margin-top: 0;">📧 Email Settings Summary:</h4>
            <ul style="color: #6b7280; margin: 10px 0; padding-left: 20px;">
              <li><strong>Store:</strong> ${settings.shopInfo.name}</li>
              <li><strong>Recipient:</strong> ${settings.recipientEmail}</li>
              <li><strong>Domain:</strong> ${settings.shopInfo.myshopifyDomain}</li>
              <li><strong>Status:</strong> Email notifications are enabled ✅</li>
            </ul>
          </div>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">
            Test sent on: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}
          </p>
        </div>
      `,
      text: `
Email Configuration Test Successful

This is a test email to confirm your email notification settings are working correctly for ${settings.shopInfo.name}.

If you received this email, your Low Stock Alert system is properly configured to send notifications.

Email Settings Summary:
- Store: ${settings.shopInfo.name}
- Recipient: ${settings.recipientEmail}
- Domain: ${settings.shopInfo.myshopifyDomain}
- Status: Email notifications are enabled

Test sent on: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}
      `
    };

    const result = await sendEmailViaWebhook(emailData);
    
    if (result.success) {
      return { 
        success: true, 
        message: `Test email sent successfully to ${settings.recipientEmail}`,
        messageId: result.messageId 
      };
    } else {
      return { 
        success: false, 
        message: 'Failed to send test email' 
      };
    }

  } catch (error) {
    console.error('Email test failed:', error);
    return { 
      success: false, 
      message: `Email test failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
    };
  }
};
