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

export const CREDENTIAL_PATTERNS = [
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/,
  /aws_secret_access_key/i,
  /AWS_SECRET_ACCESS_KEY/,
];
