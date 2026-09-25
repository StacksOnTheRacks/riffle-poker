import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigwv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '../../..');

export class MatchRuntimeStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const table = new dynamodb.Table(this, 'MatchTable', {
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    table.addGlobalSecondaryIndex({
      indexName: 'byTable',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    const handler = new lambdaNodejs.NodejsFunction(this, 'MatchRuntimeHandler', {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(repoRoot, 'src/runtime/handler.ts'),
      projectRoot: repoRoot,
      handler: 'handler',
      timeout: Duration.seconds(30),
      environment: {
        TABLE_NAME: table.tableName,
      },
      bundling: {
        target: 'node22',
        format: lambdaNodejs.OutputFormat.ESM,
        mainFields: ['module', 'main'],
        externalModules: ['@aws-sdk/*'],
      },
      depsLockFilePath: path.join(repoRoot, 'package-lock.json'),
    });

    table.grantReadWriteData(handler);

    const webSocketApi = new apigwv2.WebSocketApi(this, 'MatchWebSocketApi', {
      connectRouteOptions: {
        integration: new apigwv2Integrations.WebSocketLambdaIntegration(
          'ConnectIntegration',
          handler,
        ),
      },
      disconnectRouteOptions: {
        integration: new apigwv2Integrations.WebSocketLambdaIntegration(
          'DisconnectIntegration',
          handler,
        ),
      },
      defaultRouteOptions: {
        integration: new apigwv2Integrations.WebSocketLambdaIntegration(
          'DefaultIntegration',
          handler,
        ),
      },
    });

    const stage = new apigwv2.WebSocketStage(this, 'MatchWebSocketStage', {
      webSocketApi,
      stageName: 'prod',
      autoDeploy: true,
    });

    handler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['execute-api:ManageConnections'],
        resources: [
          Stack.of(this).formatArn({
            service: 'execute-api',
            resource: webSocketApi.apiId,
            resourceName: `${stage.stageName}/POST/@connections/*`,
          }),
        ],
      }),
    );

    new CfnOutput(this, 'WebSocketUrl', {
      value: stage.url,
    });

    new CfnOutput(this, 'TableName', {
      value: table.tableName,
    });
  }
}
