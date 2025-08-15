// middleware.ts

import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()

  const supabase = createMiddlewareClient({ req, res })

  // Refresh session if needed
  await supabase.auth.getSession()

  return res
}

// This matcher ensures middleware only runs on protected routes
export const config = {
  matcher: ['/admin', '/client'],
}
