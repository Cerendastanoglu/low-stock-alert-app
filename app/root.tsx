import type { LinksFunction, MetaFunction } from "@remix-run/node";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "@remix-run/react";

import { AppProvider } from "@shopify/polaris";
import translations from "@shopify/polaris/locales/en.json";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

// Polaris fonts (already in your code)
const shopifyFontLinks = [
  <link key="font1" rel="preconnect" href="https://cdn.shopify.com/" />,
  <link
    key="font2"
    rel="stylesheet"
    href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
  />,
];

export const meta: MetaFunction = () => [{ title: "Low Inventory App" }];

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: polarisStyles },
];

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        {shopifyFontLinks}
        <Meta />
        <Links />
      </head>
      <body>
        <AppProvider i18n={translations}>
          <Outlet />
        </AppProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
