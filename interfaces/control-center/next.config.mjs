/** @type {import('next').NextConfig} */
const configuredDevOrigins = (process.env.PRITHA_CONTROL_CENTER_ALLOWED_DEV_ORIGINS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

const nextConfig = {
  allowedDevOrigins: ["localhost", "127.0.0.1", ...configuredDevOrigins],
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
