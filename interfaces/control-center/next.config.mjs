/** @type {import('next').NextConfig} */
const configuredDevOrigins = (process.env.PRITHA_CONTROL_CENTER_ALLOWED_DEV_ORIGINS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const configuredDistDir = String(process.env.PRITHA_CONTROL_CENTER_DIST_DIR || "").trim();

const nextConfig = {
  ...(configuredDistDir ? { distDir: configuredDistDir } : {}),
  allowedDevOrigins: ["localhost", "127.0.0.1", "**.ts.net", ...configuredDevOrigins],
  devIndicators: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, max-age=0, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
