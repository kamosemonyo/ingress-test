import { Construct  } from "constructs";
import { CfnParameter, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import { aws_s3 as s3 } from 'aws-cdk-lib';
import { aws_codepipeline as codepipeline } from "aws-cdk-lib";
import { aws_ec2 as ec2 } from "aws-cdk-lib";
import { getSourceAction } from "../pipeline_stage/code-source";
import { toValidConstructName } from "../lib/util";
import { ACCOUNT_PRE, ACCOUNT_PROD, CODE_BUILD_VPC_NAME, ECR_REGION, ENV_DEV, ENV_PRE, ENV_PROD, MAIN_GIT_BRANCH } from "../lib/constants";
import { createMavenDockerBuildAction } from "../pipeline_stage/maven/mvn-build";
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { updateClusterProject } from "../pipeline_stage/update-cluster";
import { ManualApprovalAction } from "aws-cdk-lib/aws-codepipeline-actions";
import { MoneyTags, MoneyTagType } from "../tags/tags";
import { createMavenDeployAction } from "../pipeline_stage/maven/mvn-deploy";
import { ServicePipelineProps } from "./pipeline-props";
import { getPipelineVPC } from "./pipeline-vpc";

export class MavenPipelineStack extends Stack {
  constructor(scope: Construct, id: string, props: ServicePipelineProps) {
    super(scope, id, props);

    const artifactsBucket: s3.IBucket = new s3.Bucket(this, 'ArtifactsBucket', {
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

    const sourceCodeArtifact = new codepipeline.Artifact();
    const buildOutputArtifact = new codepipeline.Artifact();


    const pipeline = new codepipeline.Pipeline(this, `${toValidConstructName(repositoryName)}Pipeline`, {
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

    const vpc = getPipelineVPC(this)

    pipeline.addStage({
      stageName: 'Build',
      actions: [
        createMavenDockerBuildAction(this, {
          vpc: vpc,
          branch: branch,
          repositoryName: repositoryName,
          account: Stack.of(this).account,
          region: Stack.of(this).region,
          propertiesFilePath: props.propertiesFile,
          pomFilePath: pomFile,
          inputArtifact: sourceCodeArtifact,
          outputArtifact: buildOutputArtifact,
          environment: ENV_PRE,
          githubOrgName: githubOrgParam.valueAsString
        })
      ],
    });

    pipeline.addStage({
      stageName: 'Deploy_Dev',
      actions: [
        createMavenDeployAction(this, {
          inputArtifact: sourceCodeArtifact,
          account: ACCOUNT_PRE,
          branch: MAIN_GIT_BRANCH,
          pipelineEnv: ENV_DEV,
          propertiesFilePath: props.propertiesFile,
          ssmAccount: ACCOUNT_PRE,
          ssmRegion: ECR_REGION,
          pipelineRole: pipeline.role,
          pomFilePath: props.propertiesFile,
          repositoryName: props.repositoryName,
          vpc: vpc
        })
      ]
    });

    pipeline.addStage({
      stageName: 'Promote_To_Pre-production',
      actions: [
        new ManualApprovalAction({
          actionName: 'PromoteToPre'
        })
      ]
    });

    pipeline.addStage({
      stageName: 'Deploy_Pre-production',
      actions: [
        createMavenDeployAction(this, {
          inputArtifact: sourceCodeArtifact,
          account: ACCOUNT_PRE,
          branch: MAIN_GIT_BRANCH,
          pipelineEnv: ENV_PRE,
          propertiesFilePath: props.propertiesFile,
          ssmAccount: ACCOUNT_PRE,
          ssmRegion: ECR_REGION,
          pipelineRole: pipeline.role,
          pomFilePath: props.propertiesFile,
          repositoryName: props.repositoryName,
          vpc: vpc
        })
      ]
    });

    pipeline.addStage({
      stageName: 'Promote_To_Production',
      actions: [
        new ManualApprovalAction({
          actionName: 'PromoteToPre'
        })
      ]
    });

    pipeline.addStage({
      stageName: 'Deploy_Prod',
      actions: [
        createMavenDeployAction(this, {
          inputArtifact: sourceCodeArtifact,
          account: ACCOUNT_PROD,
          branch: MAIN_GIT_BRANCH,
          pipelineEnv: ENV_PROD,
          propertiesFilePath: props.propertiesFile,
          ssmAccount: ACCOUNT_PRE,
          ssmRegion: ECR_REGION,
          pipelineRole: pipeline.role,
          pomFilePath: props.propertiesFile,
          repositoryName: props.repositoryName,
          vpc: vpc
        })
      ]
    });

  };

  addTags (resource:any) {
    MoneyTags.addTag(MoneyTagType.PIPELINE_RESOURCE, resource);
    MoneyTags.addTag(MoneyTagType.BUILD_RESOURCE, resource);
    MoneyTags.addTag(MoneyTagType.JAVA_SERVICE, resource);
  }
}