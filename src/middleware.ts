import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;

  const isApiRoute = pathname.startsWith("/api/");

  if (!isLoggedIn) {
    if (isApiRoute) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/folders/:path*",
    "/datasets/:path*",
    "/schemas/:path*",
    "/data-sources/:path*",
    "/assistant/:path*",
    "/dashboard/:path*",
    "/profile/:path*",
    "/admin/:path*",
    "/api/folders/:path*",
    "/api/schemas/:path*",
    "/api/datasets/:path*",
    "/api/data-sources/:path*",
    "/api/dashboards/:path*",
    "/api/alerts/:path*",
    "/api/users/:path*",
    "/api/chat-history/:path*",
    "/api/chat",
    "/api/analyst-chat",
    "/api/dashboard-chat",
  ],
};
