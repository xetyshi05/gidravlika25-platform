// SUP-01: fails if a production dependency has a license that config/license-policy.json
// does not allow.
//
//   node config/check-licenses.mjs npm                  # pnpm production dependencies
//   node config/check-licenses.mjs sbom <file.cdx.json>  # Python packages in a CycloneDX SBOM
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const policy = JSON.parse(readFileSync(new URL("./license-policy.json", import.meta.url), "utf8"));
const allowed = new Set(policy.allowed);
const [mode, ...files] = process.argv.slice(2);

/** [{ name, version, licenses: string[] }] */
let packages;
if (mode === "npm") {
  const report = JSON.parse(
    execFileSync("pnpm", ["licenses", "list", "--prod", "--json"], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    }),
  );
  packages = Object.entries(report).flatMap(([license, entries]) =>
    entries.map((entry) => ({
      name: entry.name,
      version: entry.versions.join(", "),
      licenses: [license],
    })),
  );
} else if (mode === "sbom" && files.length > 0) {
  packages = files.flatMap((file) =>
    (JSON.parse(readFileSync(file, "utf8")).components ?? [])
      .filter((component) => component.purl?.startsWith("pkg:pypi/"))
      .map((component) => ({
        name: component.name,
        version: component.version,
        licenses: (component.licenses ?? [])
          .map((entry) => entry.expression ?? entry.license?.id ?? entry.license?.name)
          // Syft reports a license file it could not name as its hash.
          .filter((license) => license && !license.startsWith("sha256:")),
      })),
  );
} else {
  console.error("Usage: check-licenses.mjs npm | sbom <file.cdx.json>...");
  process.exit(2);
}

const problems = [];
for (const item of packages) {
  const licenses =
    item.licenses.length > 0 ? item.licenses : [policy.reviewed[item.name]].filter(Boolean);
  if (licenses.length === 0) {
    problems.push(`${item.name}@${item.version}: no license in the metadata`);
    continue;
  }
  for (const license of licenses) {
    if (!isAllowed(license) && !isException(item.name, license))
      problems.push(`${item.name}@${item.version}: ${license}`);
  }
}

if (problems.length > 0) {
  console.error(
    `Licenses outside config/license-policy.json — review them and extend the policy:\n${[...new Set(problems)].join("\n")}`,
  );
  process.exit(1);
}
console.log(`${packages.length} packages: every license is allowed by the policy.`);

/** An SPDX-like expression: one of the OR alternatives with every AND term allowed. */
function isAllowed(expression) {
  return expression.split(/\s+OR\s+/i).some((alternative) =>
    alternative
      .replace(/[()]/g, "")
      .split(/\s+AND\s+/i)
      .every((term) => allowed.has(normalize(term.replace(/\s+WITH\s+.*$/i, "")))),
  );
}

function normalize(license) {
  const name = license.trim();
  return policy.aliases[name] ?? name;
}

function isException(name, license) {
  return policy.exceptions.some(
    (exception) =>
      exception.license === normalize(license) &&
      (exception.package.endsWith("*")
        ? name.startsWith(exception.package.slice(0, -1))
        : name === exception.package),
  );
}
