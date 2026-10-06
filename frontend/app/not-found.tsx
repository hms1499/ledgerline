"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Grid, Col } from "@/components/grid/Grid";
import Tape from "@/components/ui/Tape";
import Verdict from "@/components/ui/Verdict";
import { withNet } from "@/lib/nav";

/**
 * The 404. This file's boundary sits under the root layout, and a missing
 * route has no shell of its own — the tape is the whole page, the same way
 * it is inside the app.
 */
function NotFoundPage() {
  const searchParams = useSearchParams();
  const search = { get: (k: string) => searchParams.get(k) };
  return (
    <Grid>
      <Col span={8} md={12}>
        <Tape>
          <Verdict
            title="There is no page here"
            body="The address is not a page on Ledgerline. A receipt link may have been typed short, or a run was opened from a bookmark that has moved."
          />
          <p>
            <Link href={withNet("/", search)} className="button-primary">
              Back to the home page
            </Link>{" "}
            <Link href={withNet("/dashboard", search)}>Open your dashboard</Link>
          </p>
        </Tape>
      </Col>
    </Grid>
  );
}

export default function NotFound() {
  // Keeps the 404'd URL's ?n=, so a payer who lost a testnet receipt is not
  // sent to mainnet by the way back.
  return (
    <Suspense>
      <NotFoundPage />
    </Suspense>
  );
}