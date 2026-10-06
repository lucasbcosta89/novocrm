import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";

function redirecionar(request: NextRequest, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  return NextResponse.redirect(url);
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = env();

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;

  if (!user && (pathname === "/app" || pathname.startsWith("/app/"))) return redirecionar(request, "/login");
  if (user && (pathname === "/login" || pathname === "/signup")) return redirecionar(request, "/app");
  return response;
}

export const config = {
  matcher: ["/app/:path*", "/login", "/signup"],
};
