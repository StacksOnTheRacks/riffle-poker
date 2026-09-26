import * as fs from 'node:fs';
import * as path from 'node:path';
import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { MatchRuntimeStack } from '../lib/match-runtime-stack.js';

export interface SynthResult {
  app: App;
  stack: MatchRuntimeStack;
  template: Template;
  outdir: string;
}

export function synthMatchRuntimeStack(): SynthResult {
  const app = new App({
    context: { 'aws:cdk:bundling-stacks': [] },
  });
  const stack = new MatchRuntimeStack(app, 'MatchRuntimeStack', {
    env: { account: '111111111111', region: 'us-east-1' },
  });
  const template = Template.fromStack(stack);
  return { app, stack, template, outdir: app.outdir };
}

export function resourcesOfType(
  template: Template,
  type: string,
): Array<[string, { Properties?: Record<string, unknown> }]> {
  return Object.entries(template.findResources(type)) as Array<
    [string, { Properties?: Record<string, unknown> }]
  >;
}

export function findStagedFile(outdir: string, fileName: string): string | null {
  for (const entry of fs.readdirSync(outdir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('asset.')) {
      continue;
    }
    const candidate = path.join(outdir, entry.name, fileName);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

const TEXT_ARTIFACT_EXTENSIONS = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt', '.map']);

/** Text files (recursively) in a built artifact dir; binary images/fonts are skipped. */
export function listTextArtifacts(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listTextArtifacts(full));
    } else if (entry.isFile() && TEXT_ARTIFACT_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

export const CREDENTIAL_PATTERNS = [
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/,
  /aws_secret_access_key/i,
  /AWS_SECRET_ACCESS_KEY/,
];
