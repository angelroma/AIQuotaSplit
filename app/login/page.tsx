import { ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";

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
    <main className="login-shell flex min-h-screen items-center justify-center px-5 py-12 text-[#18332d]">
      <div className="login-orbit" aria-hidden="true" />
      <Card className="entrance entrance-2 w-full max-w-md gap-7 rounded-[24px] border-[#d7d3c8] bg-[#fffdf8]/95 py-8 shadow-[0_28px_90px_rgba(24,51,45,0.12)] backdrop-blur-xl">
        <CardHeader className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="split-mark" aria-hidden="true"><i /><i /></span>
            <span className="private-label"><ShieldCheck aria-hidden="true" className="size-3.5" />Private</span>
          </div>
          <div className="space-y-1.5">
            <CardTitle className="font-[Iowan_Old_Style,Georgia,serif] text-3xl font-medium tracking-[-0.04em]">
              AIQuotaSplit
            </CardTitle>
            <CardDescription className="text-sm leading-6 text-[#68756f]">
              Enter the shared dashboard password to view this week&apos;s
              estimate.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form action="/api/login" method="post" className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="password">Dashboard password</Label>
              <div className="relative">
                <LockKeyhole aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#7d8882]" />
                <Input
                autoComplete="current-password"
                autoFocus
                className="h-12 rounded-xl border-[#d7d3c8] bg-[#f7f4ed] pl-10 shadow-none focus-visible:border-[#688b7e]"
                id="password"
                name="password"
                required
                type="password"
                />
              </div>
              {error ? (
                <p role="alert" className="text-sm text-[#b54a25]">
                  That password didn&apos;t work. Try again.
                </p>
              ) : null}
            </div>
            <Button className="h-12 w-full rounded-xl bg-[#18332d] text-[#fffdf8] hover:bg-[#28473f]">
              View dashboard
              <ArrowRight aria-hidden="true" className="size-4" />
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
