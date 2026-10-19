import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const roots = ["apps", "packages"];
const banned = [
  [/lorem ipsum/i, "lorem ipsum"], [/\bTODO\b/, "TODO"], [/\bFIXME\b/, "FIXME"],
  [/href\s*=\s*["']#["']/, "placeholder link"], [/console\.log\s*\(/, "console.log"],
  [/\bdebugger\b/, "debugger"], [/AI-verified/i, "fabricated AI claim"], [/99%/, "accuracy claim"],
  [/fraud detected/i, "fraud verdict"], [/fake image/i, "fake-image verdict"],
  [/voice reporting/i, "out-of-scope voice feature"], [/officer ratings|performance points/i, "out-of-scope ratings"],
  [/forecasting/i, "out-of-scope forecasting"], [/learned priority/i, "out-of-scope learned priority"]
];
const findings = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) await walk(file);
    else if (/\.(?:[cm]?[jt]sx?|css)$/.test(entry.name)) {
      const text = await readFile(file, "utf8");
      for (const [pattern, label] of banned) if (pattern.test(text)) findings.push(`${relative(process.cwd(), file)}: ${label}`);
      if (!file.includes(join("packages", "tokens")) && /#[0-9a-fA-F]{3,8}\b|\brgb\(|\bhsl\(/.test(text)) findings.push(`${relative(process.cwd(), file)}: raw colour literal`);
    }
  }
}
for (const root of roots) await walk(root);
if (findings.length) {
  process.stderr.write(`Guard failed:\n${findings.join("\n")}\n`);
  process.exitCode = 1;
} else process.stdout.write("Guard passed.\n");
