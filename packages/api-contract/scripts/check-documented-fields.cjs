// The @nestjs/swagger plugin silently drops a property it cannot describe
// (for example `@Min(-CONSTANT)`). Run in apps/api after the contract build:
// fails if a field of a DTO or response class is missing from the document.
require(require.resolve("reflect-metadata", { paths: [process.cwd()] }));
const fs = require("node:fs");
const path = require("node:path");

const files = [];
(function walk(directory) {
  for (const name of fs.readdirSync(directory)) {
    const file = path.join(directory, name);
    if (fs.statSync(file).isDirectory()) walk(file);
    else if (/\.(dto|response)\.js$/.test(name)) files.push(file);
  }
})(process.argv[2]);

const problems = [];
for (const file of files) {
  for (const [name, Class] of Object.entries(require(path.resolve(file)))) {
    if (typeof Class !== "function" || !Class.prototype) continue;
    let fields;
    try {
      fields = Object.keys(new Class());
    } catch {
      continue;
    }
    const documented = new Set();
    for (
      let current = Class;
      current && current !== Function.prototype;
      current = Object.getPrototypeOf(current)
    ) {
      if (Object.hasOwn(current, "_OPENAPI_METADATA_FACTORY"))
        for (const key of Object.keys(current._OPENAPI_METADATA_FACTORY())) documented.add(key);
      for (const key of Reflect.getMetadata("swagger/apiModelPropertiesArray", current.prototype) ??
        [])
        documented.add(key.replace(/^:/, ""));
    }
    const lost = fields.filter((field) => !documented.has(field));
    if (lost.length > 0) problems.push(`${name}.${lost.join(`, ${name}.`)} (${file})`);
  }
}
if (problems.length > 0) {
  console.error(
    `Fields missing from the OpenAPI document — describe them with @ApiProperty:\n${problems.join("\n")}`,
  );
  process.exit(1);
}
