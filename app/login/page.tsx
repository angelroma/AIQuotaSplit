import { ArrowRight, LockKeyhole } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f5f1] px-5 py-12 text-[#202422]">
      <Card className="w-full max-w-md border-[#deded8] bg-white shadow-[0_24px_70px_rgba(31,38,35,0.08)]">
        <CardHeader className="space-y-4">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-[#e8eefb] text-[#275dc7]">
            <LockKeyhole aria-hidden="true" className="size-5" />
          </div>
          <div className="space-y-1.5">
            <CardTitle className="text-2xl tracking-[-0.03em]">
              AIQuotaSplit
            </CardTitle>
            <CardDescription className="text-base leading-6 text-[#68706c]">
              Enter the shared dashboard password to view this week&apos;s
              estimate.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form action="/api/login" method="post" className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="password">Dashboard password</Label>
              <Input
                autoComplete="current-password"
                autoFocus
                id="password"
                name="password"
                required
                type="password"
              />
              {error ? (
                <p role="alert" className="text-sm text-[#b54a25]">
                  That password didn&apos;t work. Try again.
                </p>
              ) : null}
            </div>
            <Button className="h-11 w-full bg-[#202422] text-white hover:bg-[#303632]">
              View dashboard
              <ArrowRight aria-hidden="true" className="size-4" />
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
