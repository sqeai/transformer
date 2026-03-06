export { auth as middleware } from "@/lib/auth";

export const config = {
  matcher: [
    "/folders/:path*",
    "/datasets/:path*",
    "/schemas/:path*",
    "/data-sources/:path*",
    "/assistant/:path*",
    "/dashboard/:path*",
    "/api/folders/:path*",
    "/api/schemas/:path*",
    "/api/datasets/:path*",
    "/api/data-sources/:path*",
    "/api/chat",
    "/api/analyst-chat",
    "/api/dashboard-chat",
  ],
};
