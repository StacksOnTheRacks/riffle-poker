import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { before, describe, it } from 'node:test';
import { Match } from 'aws-cdk-lib/assertions';
import { DASHBOARD_ARTIFACT_DIR } from '../lib/match-runtime-stack.js';
import {
  CREDENTIAL_PATTERNS,
  findStagedFile,
  resourcesOfType,
  synthMatchRuntimeStack,
  type SynthResult,
} from './support.js';

describe('MatchRuntimeStack dashboard SPA hosting', () => {
  let synth: SynthResult;

  before(() => {
    synth = synthMatchRuntimeStack();
  });

  it('keeps the SPA origin bucket fully private', () => {
    synth.template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });

    for (const [, bucket] of resourcesOfType(synth.template, 'AWS::S3::Bucket')) {
      const props = bucket.Properties ?? {};
      assert.equal(props.WebsiteConfiguration, undefined);
      assert.ok(
        props.AccessControl === undefined || props.AccessControl === 'Private',
        'bucket must not use a public ACL',
      );
    }
  });

  it('allows GetObject only to CloudFront for this distribution via OAC', () => {
    synth.template.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1);
    synth.template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        Origins: [
          Match.objectLike({
            OriginAccessControlId: Match.anyValue(),
            S3OriginConfig: Match.anyValue(),
          }),
        ],
      }),
    });

    const [distributionId] = Object.keys(
      synth.template.findResources('AWS::CloudFront::Distribution'),
    );

    for (const [, policy] of resourcesOfType(synth.template, 'AWS::S3::BucketPolicy')) {
      const statements = (
        (policy.Properties?.PolicyDocument as { Statement: Array<Record<string, unknown>> })
          .Statement
      );
      for (const statement of statements) {
        if (statement.Effect !== 'Allow') {
          continue;
        }
        const principal = statement.Principal as Record<string, unknown> | string | undefined;
        assert.notEqual(principal, '*', 'no public Allow principal');
        assert.notDeepEqual(principal, { AWS: '*' }, 'no public Allow principal');

        const actions = ([] as string[]).concat(statement.Action as string | string[]);
        if (actions.includes('s3:GetObject')) {
          assert.deepEqual(principal, { Service: 'cloudfront.amazonaws.com' });
          const condition = JSON.stringify(statement.Condition);
          assert.match(condition, /AWS:SourceArn/);
          assert.ok(condition.includes(distributionId!), 'condition is bound to this distribution');
        }
        assert.ok(!actions.includes('s3:ListBucket'), 'no public ListBucket');
        assert.ok(!actions.includes('s3:PutObject'), 'no public PutObject');
      }
    }
  });

  it('serves index.html at the root and falls back for 403 and 404 without a CloudFront Function', () => {
    synth.template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        DefaultRootObject: 'index.html',
        CustomErrorResponses: Match.arrayWith([
          Match.objectLike({ ErrorCode: 403, ResponseCode: 200, ResponsePagePath: '/index.html' }),
          Match.objectLike({ ErrorCode: 404, ResponseCode: 200, ResponsePagePath: '/index.html' }),
        ]),
      }),
    });
    synth.template.resourceCountIs('AWS::CloudFront::Function', 0);

    for (const [, distribution] of resourcesOfType(
      synth.template,
      'AWS::CloudFront::Distribution',
    )) {
      const config = distribution.Properties?.DistributionConfig as Record<string, unknown>;
      assert.equal(config.Aliases, undefined, 'default cloudfront.net hostname only');
      assert.equal(config.ViewerCertificate, undefined, 'no custom certificate');
      const behavior = config.DefaultCacheBehavior as Record<string, unknown>;
      assert.equal(behavior.FunctionAssociations, undefined);
    }
  });

  it('deploys the dashboard artifact and a config.json with only webSocketUrl', () => {
    const deployments = resourcesOfType(synth.template, 'Custom::CDKBucketDeployment');
    assert.equal(deployments.length, 1);
    const props = deployments[0]![1].Properties!;

    const [siteBucketId] = Object.keys(synth.template.findResources('AWS::S3::Bucket'));
    assert.deepEqual(props.DestinationBucketName, { Ref: siteBucketId });
    assert.equal((props.SourceObjectKeys as unknown[]).length, 2);

    assert.ok(fs.existsSync(path.join(DASHBOARD_ARTIFACT_DIR, 'index.html')));
    const stagedIndex = findStagedFile(synth.outdir, 'index.html');
    assert.ok(stagedIndex, 'index.html is staged as a deployment source');
    assert.match(fs.readFileSync(stagedIndex, 'utf8'), /dashboard-play\.js/);

    const stagedConfig = findStagedFile(synth.outdir, 'config.json');
    assert.ok(stagedConfig, 'config.json is staged as a deployment source');
    const rawConfig = fs.readFileSync(stagedConfig, 'utf8');
    const markerMatch = rawConfig.match(/^\{"webSocketUrl":(<<marker:[^>]+>>)\}$/);
    assert.ok(markerMatch, `config.json has only webSocketUrl bound to a deploy-time token: ${rawConfig}`);
    const marker = markerMatch[1]!;

    const markers = (props.SourceMarkers as Array<Record<string, unknown>>).find(
      (entry) => marker in entry,
    );
    assert.ok(markers, 'config.json marker is resolved at deploy time');
    const markerValue = markers[marker] as { 'Fn::Join': [string, unknown[]] };

    const expected = synth.stack.resolve(synth.stack.webSocketUrl) as {
      'Fn::Join': [string, unknown[]];
    };
    const expectedParts = [...expected['Fn::Join'][1]];
    expectedParts[0] = `"${expectedParts[0] as string}`;
    expectedParts[expectedParts.length - 1] = `${expectedParts.at(-1) as string}"`;
    assert.deepEqual(markerValue, { 'Fn::Join': ['', expectedParts] });

    const serialized = JSON.stringify({ rawConfig, markerValue });
    for (const pattern of CREDENTIAL_PATTERNS) {
      assert.doesNotMatch(serialized, pattern);
    }
  });

  it('ships no credential material in the built dashboard artifact', () => {
    for (const name of fs.readdirSync(DASHBOARD_ARTIFACT_DIR)) {
      const body = fs.readFileSync(path.join(DASHBOARD_ARTIFACT_DIR, name), 'utf8');
      for (const pattern of CREDENTIAL_PATTERNS) {
        assert.doesNotMatch(body, pattern, `${name} must not contain ${pattern}`);
      }
    }
  });

  it('adds no Cognito or custom-domain surface', () => {
    synth.template.resourceCountIs('AWS::Cognito::UserPool', 0);
    synth.template.resourceCountIs('AWS::Cognito::UserPoolDomain', 0);
    synth.template.resourceCountIs('AWS::CertificateManager::Certificate', 0);
    synth.template.resourceCountIs('AWS::Route53::RecordSet', 0);
  });

  it('keeps the existing runtime outputs', () => {
    synth.template.hasOutput('WebSocketUrl', {});
    synth.template.hasOutput('TableName', {});
  });
});
