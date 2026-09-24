import Tape from "@/components/ui/Tape";
import { SAMPLE_CSV, sampleCsvHref } from "@/lib/sample-csv";

export default function CsvHelp() {
  return (
    <Tape title="What the file must look like">
      <pre className="hex" style={{ margin: 0, whiteSpace: "pre-wrap" }}>{SAMPLE_CSV}</pre>
      <p className="because">
        Header required and spelled exactly as above. Amounts are written the way you
        would write them on an invoice; this page converts them using each token&apos;s
        own decimals, read from the chain.{" "}
        <a href={sampleCsvHref()} download="ledgerline-sample.csv">Download this sample</a>{" "}
        and replace the recipients with your own.
      </p>
    </Tape>
  );
}
