import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Sign Up",
  description: "Create a Strale account and get your API key.",
};

export default function SignupPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center">
      <h1 className="text-3xl font-bold tracking-tight">
        Get your API key
      </h1>
      <p className="mt-4 text-muted">
        The signup dashboard is coming soon. In the meantime, you can register
        via the API or email for early access and a free API key.
      </p>

      <div className="mt-8 w-full rounded-xl border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold">Register via API</h2>
        <p className="mt-2 text-sm text-muted">
          Create an account and get your key instantly:
        </p>
        <pre className="mt-4 overflow-x-auto rounded-lg border border-border bg-background p-3 text-left font-mono text-xs text-foreground">
{`curl -X POST \\
  https://api.strale.io/v1/auth/register \\
  -H "Content-Type: application/json" \\
  -d '{"email": "you@example.com"}'`}
        </pre>
      </div>

      <div className="mt-4 w-full rounded-xl border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold">Or email us</h2>
        <p className="mt-2 text-sm text-muted">
          Email{" "}
          <a href="mailto:petter@strale.io" className="text-accent hover:underline">
            petter@strale.io
          </a>{" "}
          for early access and a free API key with &euro;2.00 in trial credits.
        </p>
      </div>

      <p className="mt-8 text-sm text-muted">
        Already have a key?{" "}
        <Link href="/docs/getting-started" className="text-accent hover:underline">
          Read the quickstart guide
        </Link>
      </p>
    </div>
  );
}
