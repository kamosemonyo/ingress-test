import { CfnParameter, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import { Artifact, Pipeline } from "aws-cdk-lib/aws-codepipeline";
import { ManualApprovalAction } from "aws-cdk-lib/aws-codepipeline-actions";
import { Vpc } from "aws-cdk-lib/aws-ec2";
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Bucket, IBucket } from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import { CODE_BUILD_VPC_NAME, ENV_DEV, ENV_PRE, ENV_PROD, GITHUB_ORG, MAIN_GIT_BRANCH } from "../lib/constants";
import { toValidConstructName } from "../lib/util";
import { getSourceAction } from "../pipeline_stage/code-source";
import { createKongDockerBuildAction } from "../pipeline_stage/kong/kong-build";
import { createKongDeployAction } from "../pipeline_stage/kong/kong-deploy";
import { updateClusterProject } from "../pipeline_stage/update-cluster";
import { MoneyTags } from "../tags/tags";


interface KongPipelineProps extends StackProps {
  repositoryName:string,
  serviceName: string,
  propertiesFile:string,
  replicas: Number,
  host?:string
}

export class KongPipelineStack extends Stack {
  constructor(scope: Construct, id: string, props: KongPipelineProps) {
    super(scope, id, props);

     const artifactsBucket:IBucket = new Bucket(this, 'ArtifactsBucket', {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const githubOrgParam = new CfnParameter(this, 'githubOrg', {
      type: 'String',
      description: 'Github organisation name',
      default: process.env.GITHUB_ORG ?? 'mmi-holdings-ces',
    });


    const sourceProviderParam = new CfnParameter(this, 'sourceProvider', {
      type: 'String',
      description: 'Pipeline source provider',
      default: process.env.SOURCE_PROVIDER ?? 'github',
      allowedValues: ['github', 'codecommit', 's3'],
    });

    const bucketKeyParam = new CfnParameter(this, 'bucketKey', {
      type: 'String',
      description: 's3 source bucket key',
      default: process.env.S3_BUCKET_KEY ?? '',
    });

    const bucketNameParam = new CfnParameter(this, 'bucket', {
      type: 'String',
      description: 's3 source bucket name',
      default: process.env.S3_BUCKET ?? '',
    });

    const repositoryName = props.repositoryName;
    const branch: string = MAIN_GIT_BRANCH;
    const pomFile = 'pom.xml'

    if (!repositoryName) {
      throw Error('Expected context [repositoryName] to be defined.');
    }

    const sourceCodeArtifact = new Artifact();
    const buildOutputArtifact = new Artifact();


    const pipeline = new Pipeline(this, `${toValidConstructName(repositoryName)}Pipeline`, {
      restartExecutionOnUpdate: true,
      pipelineName: `${repositoryName}-pipeline`,
      artifactBucket: artifactsBucket,
    });

    MoneyTags.addPipelineTags(pipeline);

    pipeline.role.addToPrincipalPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['codebuild:StartBuild'],
      resources: ['*']
    }))

    pipeline.addStage({
      stageName: 'Source',
      actions: [
        getSourceAction(this, {
          branch: branch,
          repositoryName: repositoryName,
          sourceArtifact: sourceCodeArtifact,
          sourceProvider: sourceProviderParam.valueAsString,
          githubOrg: githubOrgParam.valueAsString,
          bucketKey: bucketKeyParam.valueAsString,
          bucketName: bucketNameParam.valueAsString,
          
        })
      ]
    });

    const vpc = Vpc.fromLookup(this, 'CodeBuildVpc', {
      vpcName: CODE_BUILD_VPC_NAME,
      isDefault: false,
    });

    pipeline.addStage({
      stageName: 'Build',
      actions: [
        createKongDockerBuildAction(this, {
          vpc: vpc,
          branch: branch,
          repositoryName: repositoryName,
          account: Stack.of(this).account,
          region: Stack.of(this).region,
          propertiesFilePath: props.propertiesFile,
          pomFilePath: pomFile,
          inputArtifact: sourceCodeArtifact,
          outputArtifact: buildOutputArtifact,
          environment: ENV_DEV,
          githubOrgName: githubOrgParam.valueAsString
        })
      ]
    });

    pipeline.addStage({
      stageName: 'Deploy_Dev',
      actions: [
        createKongDeployAction(this, {
          vpc: vpc,
          inputArtifact: sourceCodeArtifact,
          account: Stack.of(this).account,
          region: Stack.of(this).region,
          branch: branch,
          repositoryName: repositoryName,
          environment: ENV_DEV,
          githubOrgName: GITHUB_ORG,
          propertiesFilePath: props.propertiesFile,
          host: props.host
        })
      ]
    });

    pipeline.addStage({
      stageName:'Promote_To_Preprod',
      actions: [
        new ManualApprovalAction({
          actionName: 'DeployToPreprod'
        })
      ]
    });

    pipeline.addStage({
      stageName:'Deploy_To_Preprod',
      actions: [
        createKongDeployAction(this, {
          vpc: vpc,
          branch: branch,
          repositoryName: repositoryName,
          account: Stack.of(this).account,
          region: Stack.of(this).region,
          propertiesFilePath: props.propertiesFile,
          inputArtifact: sourceCodeArtifact,
          environment: ENV_PRE,
          githubOrgName: githubOrgParam.valueAsString,
          host: props.host
        })
      ]
    });

    pipeline.addStage({
      stageName: 'Promote_To_Production',
      actions: [
        new ManualApprovalAction({
          actionName: 'PromoteToProduction'
        })
      ]
    });

    pipeline.addStage({
      stageName: 'Deploy_To_Production',
      actions: [
        createKongDeployAction(this, {
          vpc: vpc,
          branch: branch,
          githubOrgName: GITHUB_ORG,
          repositoryName: repositoryName,
          account: Stack.of(this).account,
          region: Stack.of(this).region,
          inputArtifact: sourceCodeArtifact,
          environment: ENV_PROD,
          propertiesFilePath: props.propertiesFile,
          host: props.host
        })
      ]
    });
  }
}