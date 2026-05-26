'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Lock } from 'lucide-react';
import { Card, CardContent } from '../components/qq/card';
import { Button } from '../components/qq/button';

/**
 * Generic "you don't have access to this area" page.
 *
 * Linked to from anywhere a user hits a route they're not permitted for.
 * Optional `?area=<name>` query param shows what they were trying to reach.
 *
 * Kept deliberately simple — a small card with a clear message and an
 * action to go back. The actual permission check lives in route guards
 * (server) and sidebar filtering (client); this page is the polite UX
 * for the rare case someone deep-links to a forbidden URL.
 */
export default function ForbiddenPage() {
  const sp = useSearchParams();
  const area = sp.get('area');

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-secondary mb-4">
            <Lock className="h-6 w-6 text-muted-foreground" />
          </div>
          <h1 className="text-xl font-semibold text-foreground">
            Access not granted
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {area ? (
              <>
                You don&apos;t currently have access to{' '}
                <span className="font-medium text-foreground">{area}</span>.
              </>
            ) : (
              <>You don&apos;t have access to this area of the Hub.</>
            )}
            <br />
            Contact your administrator if you think this is a mistake.
          </p>
          <div className="mt-6 flex items-center justify-center gap-2">
            <Link href="/">
              <Button variant="outline">Back to sign in</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
