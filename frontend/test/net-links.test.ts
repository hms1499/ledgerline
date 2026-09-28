import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : [];
  });

/**
 * Every internal link names its network. A literal "/new" opens on the
 * default network, mainnet, so a payer rehearsing on testnet lands on real
 * money one click later with the wallet button offering to switch there.
 * A link either goes through withNet(), which carries the page's ?n=, or
 * names the network it means with ?n= itself.
 */
describe("internal links keep the network", () => {
  const literal = /(?:href=|push\()\s*\{?\s*(["`])(\/[^"`]*)\1/g;

  it("no page or component links to a route without ?n=", () => {
    const offenders: string[] = [];
    for (const f of [...files(join(root, "app")), ...files(join(root, "components"))]) {
      for (const m of readFileSync(f, "utf8").matchAll(literal)) {
        if (!m[2]!.includes("?n=")) offenders.push(`${relative(root, f)}: ${m[2]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("would catch the link that sent /runs on testnet to mainnet /new", () => {
    expect([...'<Link href="/new">Create a payout run</Link>'.matchAll(literal)].map((m) => m[2])).toEqual(["/new"]);
  });
});
