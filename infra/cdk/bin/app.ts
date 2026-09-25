#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { MatchRuntimeStack } from '../lib/match-runtime-stack.js';

const app = new App();

new MatchRuntimeStack(app, 'MatchRuntimeStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
});
