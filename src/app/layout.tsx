import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const GTM_ID = "GTM-WQ24PKSC";

export const metadata: Metadata = {
  title: "VOYAH - Coming Soon",
  description: "We're building something beautiful. Leave your details and be the first to know when we launch.",
  icons: {
    icon: [
      {
        url: "/voyah/wp-content/themes/voyah/assets/svg/voyah_logo.svg",
        type: "image/svg+xml",
      },
    ],
    apple: [
      {
        url: "/voyah/wp-content/themes/voyah/assets/svg/voyah_logo.svg",
        type: "image/svg+xml",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <Script id="gtm" strategy="beforeInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');`}
        </Script>
      </head>
      <body className={`${inter.variable} antialiased`}>
        <noscript>
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript>
        {children}
        <Script src="/voyah/js/hide-footer.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
