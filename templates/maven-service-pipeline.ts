import { CfnParameter, Construct, Stack, StackProps } from "@aws-cdk/core";
import { Bucket, IBucket } from '@aws-cdk/aws-s3';
import { Artifact, Pipeline, StageProps } from "@aws-cdk/aws-codepipeline";
import { createEcrRepository } from "../modules/ecr-repository";
import { createMavenDockerBuildAction } from "../modules/mvn-docker-build";
import { getSourceAction } from "../modules/code-source";
import { toValidConstructName } from "../lib/util";
import { createEksDeployAction } from "../modules/eks-deployment";
import { ManualApprovalAction } from "@aws-cdk/aws-codepipeline-actions";
import { mainGitBranch } from "../lib/constants";

const pipelineArtifactsBucket: string = 'pipeline-artifacts';
const defaultSsmRegion: string = 'eu-west-1';

interface stackProps extends StackProps {}

export class MavenServicePipeline extends Stack {
  constructor(scope: Construct, id: string, props: stackProps) {
    super(scope, id, props);

    const artifactsBucket: IBucket = Bucket.fromBucketName(this, 'ArtifactsBucket', pipelineArtifactsBucket);

    const githubOrgParam = new CfnParameter(this, 'githubOrg', {
      type: 'String',
      description: 'Github organisation name',
      default: process.env.GITHUB_ORG ?? 'mmi-holdings-ces',
    });

    const branchParam = new CfnParameter(this, 'branch', {
      type: 'String',
      description: 'Github/Codecommit source branch',
      default: process.env.SOURCE_BRANCH || mainGitBranch,
    });

    const sourceProviderParam = new CfnParameter(this, 'sourceProvider', {
      type: 'String',
      description: 'Pipeline source provider',
      default: process.env.SOURCE_PROVIDER ?? 'github',
      allowedValues: ['github', 'codecommit', 's3'],
    });

    const propertiesFilePathParam = new CfnParameter(this, 'propertiesFile', {
      type: 'String',
      description: 'pom.properties file path',
      default: process.env.POM_PROPERTIES_FILE,
    });

    const pomFilePathParam = new CfnParameter(this, 'pomFile', {
      type: 'String',
      description: 'pom.xml file path',
      default: process.env.POM_FILE ?? 'pom.xml',
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

    const replicasParam = new CfnParameter(this, 'replicas', {
      type: 'Number',
      description: 'K8s deployment replicas, defaults to 1',
      default: 1,
    });

    const repositoryName: string = this.node.tryGetContext('repositoryName');
    const branch: string = branchParam.valueAsString;

    if (!repositoryName) {
      throw Error('Expected context [repositoryName] to be defined.')
    }

    const ecrRepository = createEcrRepository(this, { repositoryName, env: { account: this.account, region: 'af-south-1' }});

    const sourceCodeArtifact = new Artifact();
    const buildOutputArtifact = new Artifact();

    const pipelineStages: StageProps[] = [];

    pipelineStages.push({
      stageName: 'Source',
      actions: [
        getSourceAction(this, {
          branch,
          repositoryName,
          sourceArtifact: sourceCodeArtifact,
          sourceProvider: sourceProviderParam.valueAsString,
          githubOrg: githubOrgParam.valueAsString,
          bucketKey: bucketKeyParam.valueAsString,
          bucketName: bucketNameParam.valueAsString,
        }),
      ]
    });

    pipelineStages.push({
      stageName: 'Approve_Build',
      actions: [
        new ManualApprovalAction({
          actionName: 'Approve',
        }),
      ],
    });

    pipelineStages.push({
      stageName: 'Build',
      actions: [
        createMavenDockerBuildAction(this, {
          branch,
          repositoryName,
          ssmRegion: defaultSsmRegion,
          propertiesFilePath: propertiesFilePathParam.valueAsString,
          pomFilePath: pomFilePathParam.valueAsString,
          ecrRegion: ecrRepository.env.region,
          ecrAccount: ecrRepository.env.account,
          inputArtifact: sourceCodeArtifact,
          outputArtifact: buildOutputArtifact,
        }),
      ],
    });

    pipelineStages.push({
      stageName: 'Approve_Deploy',
      actions: [
        new ManualApprovalAction({
          actionName: 'Approve',
        }),
      ],
    });

    pipelineStages.push({
      stageName: 'Deploy',
      actions: [
        createEksDeployAction(this, {
          project: repositoryName,
          replicas: replicasParam.valueAsNumber,
          environment: resolveEnvironment(branchParam.valueAsString),
          branch: branchParam.valueAsString,
          inputArtifact: buildOutputArtifact,
        }),
      ],
    });

    new Pipeline(this, `${toValidConstructName(repositoryName)}Pipeline`, {
      pipelineName: `${repositoryName}-${branchParam.valueAsString}`,
      stages: pipelineStages,
      artifactBucket: artifactsBucket,
    });
  };
}

const resolveEnvironment = (branch: string): string => {
  if (branch === mainGitBranch) {
    return 'prod';
  } else if(branch === 'release') {
    return 'pre';
  }

  return 'dev';
}