"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "antd";
import { Grid, Col } from "@/components/grid/Grid";
import Tape from "@/components/ui/Tape";
import Verdict from "@/components/ui/Verdict";
import { withNet } from "@/lib/nav";
import { describeError } from "@/lib/errors";

/**
 * A page failed to draw. This file's boundary sits under the root layout, so
 * the tape CSS and antd are alive here, but the failed segment's own shell is
 * not — this block of paper is the whole page.
 */
function ErrorPage({
  error,
  reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  const searchParams = useSearchParams();
  const search = { get: (k: string) => searchParams.get(k) };
  const reason = describeError(error);
  return (
    <Grid>
      <Col span={8} md={12}>
        <Tape>
          <Verdict
            tone="error"
            title="Something came off the roll wrong"
            body="The page failed before it could draw. Your runs, drafts and edits are kept in this browser, so nothing is lost — reloading usually fixes it."
          />
          {reason && <p className="because raw-reason">{reason}</p>}
          {error.digest && <p className="hex">Error {error.digest}</p>}
          <p>
            <Button type="primary" onClick={() => reset()}>Reload the page</Button>{" "}
            <Link href={withNet("/dashboard", search)}>Open your dashboard</Link>
          </p>
        </Tape>
      </Col>
    </Grid>
  );
}

export default function Error(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // The links keep the failing URL's ?n=, so a payer who was rehearsing on
  // testnet is not sent to mainnet by the recovery page.
  return (
    <Suspense>
      <ErrorPage {...props} />
    </Suspense>
  );
}