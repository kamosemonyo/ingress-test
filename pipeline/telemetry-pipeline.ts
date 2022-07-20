import { RemovalPolicy, Stack } from "aws-cdk-lib";
import { Artifact, Pipeline } from "aws-cdk-lib/aws-codepipeline";
import { Vpc } from "aws-cdk-lib/aws-ec2";
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Bucket, IBucket } from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import { CODE_BUILD_VPC_NAME, GITHUB_HOST, GITHUB_ORG, MAIN_GIT_BRANCH } from "../lib/constants";
import { toValidConstructName } from "../lib/util";
import { getSourceAction } from "../pipeline_stage/code-source";
import { ServicePipelineProps } from "./pipeline-props";
import { getPipelineVPC } from "./pipeline-vpc";


export class TelemetryPipelineStack extends Stack {
  constructor(scope: Construct, id: string, props: ServicePipelineProps) {
    super(scope, id, props);
    
    const artifactsBucket:IBucket = new Bucket(this, 'ArtifactsBucket', {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const sourceCodeArtifact = new Artifact();

    const pipeline = new Pipeline(this, `${toValidConstructName(props.repositoryName)}Pipeline`, {
      restartExecutionOnUpdate: true,
      pipelineName: `${props.repositoryName}-pipeline`,
      artifactBucket: artifactsBucket,
    });

    pipeline.role.addToPrincipalPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['codebuild:StartBuild'],
      resources: ['*']
    }))

    pipeline.addStage({
      stageName: 'Source',
      actions: [
        getSourceAction(this, {
          branch: MAIN_GIT_BRANCH,
          repositoryName: props.repositoryName,
          sourceArtifact: sourceCodeArtifact,
          sourceProvider: GITHUB_HOST,
          githubOrg: GITHUB_ORG,
          bucketName: artifactsBucket.bucketName
        })
      ]
    });

    const vpc = getPipelineVPC(this)



  }
}