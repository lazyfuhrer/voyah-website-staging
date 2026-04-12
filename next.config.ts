import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    qualities: [100, 75],
  },

  async redirects() {
    return [
      // ✅ Default landing
      {
        source: "/",
        destination: "/en/home",
        permanent: true,
      },

      // ✅ /en shortcut
      {
        source: "/en",
        destination: "/en/home",
        permanent: false,
      },

      // 🔥 Remove .html
      {
        source: "/:lang/:path*.html",
        destination: "/:lang/:path*",
        permanent: true,
      },

      // ✅ Hide internal voyah
      {
        source: "/voyah",
        destination: "/en/home",
        permanent: false,
      },
      {
        source: "/voyah/ar",
        destination: "/ar/home",
        permanent: false,
      },

      // ✅ Optional shortcut
      {
        source: "/contact-us",
        destination: "/en/contact-us",
        permanent: false,
      },
      {
        source: "/book-a-test-drive",
        destination: "/en/book-a-test-drive",
        permanent: false,
      },
    ];
  },

  async rewrites() {
    return [
      // =========================
      // 🌐 PAGE ROUTING
      // =========================

      // EN pages
      {
        source: "/en/home",
        destination: "/voyah/index.html",
      },
      {
        source: "/en/contact-us",
        destination: "/voyah/contact-us/index.html",
      },
      {
        source: "/en/contact-us/thankyou",
        destination: "/voyah/contact-us/thankyou.html",
      },
      {
        source: "/en/book-a-test-drive",
        destination: "/voyah/book-a-test-drive/index.html",
      },
      {
        source: "/en/:path(voyah-dream|voyah-free|privacy-policy|terms-of-use)",
        destination: "/voyah/:path/index.html",
      },

      // AR pages
      {
        source: "/ar/home",
        destination: "/voyah/ar/index.html",
      },
      {
        source: "/ar/contact-us",
        destination: "/voyah/ar/contact-us/index.html",
      },
      {
        source: "/ar/contact-us/thankyou",
        destination: "/voyah/ar/contact-us/thankyou.html",
      },
      {
        source: "/ar/book-a-test-drive",
        destination: "/voyah/ar/book-a-test-drive/index.html",
      },
      {
        source: "/ar/:path(voyah-dream|voyah-free|privacy-policy|terms-of-use)",
        destination: "/voyah/ar/:path/index.html",
      },

      // =========================
      // 🔥 STATIC ASSETS
      // =========================

      // EN assets
      {
        source: "/en/wp-content/:path*",
        destination: "/voyah/wp-content/:path*",
      },
      {
        source: "/en/wp-includes/:path*",
        destination: "/voyah/wp-includes/:path*",
      },

      // AR assets
      {
        source: "/ar/wp-content/:path*",
        destination: "/voyah/ar/wp-content/:path*",
      },
      {
        source: "/ar/wp-includes/:path*",
        destination: "/voyah/ar/wp-includes/:path*",
      },

      // ROOT assets (important)
      {
        source: "/wp-content/:path*",
        destination: "/voyah/wp-content/:path*",
      },
      {
        source: "/wp-includes/:path*",
        destination: "/voyah/wp-includes/:path*",
      },
    ];
  },
};

export default nextConfig;