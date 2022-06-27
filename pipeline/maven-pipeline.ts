import { Construct  } from "constructs";
import { CfnParameter, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import { aws_s3 as s3 } from 'aws-cdk-lib';
import { aws_codepipeline as codepipeline } from "aws-cdk-lib";
import { aws_ec2 as ec2 } from "aws-cdk-lib";
import { getSourceAction } from "../pipeline_stage/code-source";
import { getClusterName, toValidConstructName } from "../lib/util";
import { ACCOUNT_PRE, CODE_BUILD_VPC_NAME, ENV_DEV, ENV_PRE, ENV_PROD, MAIN_GIT_BRANCH } from "../lib/constants";
import { createMavenDeployAction, createMavenDockerBuildAction } from "../pipeline_stage/maven/mvn-build";
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { updateClusterProject } from "../pipeline_stage/update-cluster";
import { ManualApprovalAction } from "aws-cdk-lib/aws-codepipeline-actions";
import { MoneyTags, MoneyTagType } from "../tags/tags";

interface MavenPipelineProps extends StackProps {
  repositoryName:string,
  serviceName: string,
  propertiesFile:string,
  replicas: Number
}

export class MavenPipelineStack extends Stack {
  constructor(scope: Construct, id: string, props: MavenPipelineProps) {
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
      pipelineName: `${repositoryName}-${branch}`,
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

    const vpc = ec2.Vpc.fromLookup(this, 'CodeBuildVpc', {
      vpcName: CODE_BUILD_VPC_NAME,
      isDefault: false,
    });

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

    // pipeline.addStage({
    //   stageName: 'Deploy_Dev',
    //   actions: [
    //     updateClusterProject(this, {
    //       input: buildOutputArtifact,
    //       account: Stack.of(this).account,
    //       region: Stack.of(this).region,
    //       branch: branch,
    //       githubOrg: githubOrgParam.valueAsString,
    //       repositoryName: repositoryName,
    //       deployEnv: ENV_DEV
    //     })
    //   ]
    // });

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
          inputArtifact: buildOutputArtifact,
          clusterName: getClusterName(ENV_PRE),
          account: ACCOUNT_PRE,
          branch: MAIN_GIT_BRANCH,
          environment: ENV_PRE,
          replicas: props.replicas,
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
          inputArtifact: buildOutputArtifact,
          account: Stack.of(this).account,
          branch: branch,
          repositoryName: repositoryName,
          environment: ENV_PROD,
          clusterName: getClusterName(ENV_PROD),
          replicas: props.replicas,
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