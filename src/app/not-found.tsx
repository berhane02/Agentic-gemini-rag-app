import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <h1 className="text-4xl font-bold">404</h1>
      <p className="mt-2 text-lg text-muted-foreground">Page not found</p>
      <Link
        href="/"
        className="mt-6 inline-block rounded-md border px-4 py-2 text-sm hover:bg-accent"
      >
        Go home
      </Link>
    </main>
  );
}
