import { CfnParameter, Construct, Stack, StackProps } from "@aws-cdk/core";
import { Bucket, IBucket } from '@aws-cdk/aws-s3';
import { Artifact, Pipeline, StageProps } from "@aws-cdk/aws-codepipeline";
import { createEcrRepository } from "../modules/ecr-repository";
import { getMavenDockerBuildAction } from "../modules/mvn-docker-build";
import { getSourceAction } from "../modules/code-source";
import { toValidConstructName } from "../lib/util";
import { createEcsDeployAction } from "../modules/ecs-service";
import { ManualApprovalAction } from "@aws-cdk/aws-codepipeline-actions";

const pipelineArtifactsBucket: string = 'pipeline-artifacts';

interface stackProps extends StackProps {}

export class MavenServicePipeline extends Stack {
  constructor(scope: Construct, id: string, props: stackProps) {
    super(scope, id, props);

    const artifactsBucket: IBucket = Bucket.fromBucketName(this, 'ArtifactsBucket', pipelineArtifactsBucket);

    const githubOrgParam = new CfnParameter(this, 'github-org', {
      type: 'String',
      description: 'Github organisation name',
      default: process.env.GITHUB_ORG ?? 'mmi-holdings-ces',
    });

    const branchParam = new CfnParameter(this, 'branch', {
      type: 'String',
      description: 'Github/Codecommit source branch',
      default: process.env.SOURCE_BRANCH || 'master'
    });

    const sourceProviderParam = new CfnParameter(this, 'source-provider', {
      type: 'String',
      description: 'Pipeline source provider',
      default: process.env.SOURCE_PROVIDER ?? 'github',
      allowedValues: ['github', 'codecommit', 's3'],
    });

    const propertiesFilePathParam = new CfnParameter(this, 'properties-file', {
      type: 'String',
      description: 'pom.properties file path',
      default: process.env.POM_PROPERTIES_FILE,
    });

    const pomFilePathParam = new CfnParameter(this, 'pom-file', {
      type: 'String',
      description: 'pom.xml file path',
      default: process.env.POM_FILE ?? 'pom.xml',
      allowedPattern: '*pom.xml'
    });

    const repositoryName: string = this.node.tryGetContext('repositoryName');

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
          repositoryName,
          githubOrg: githubOrgParam.valueAsString,
          sourceProvider: sourceProviderParam.valueAsString,
          sourceArtifact: sourceCodeArtifact,
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
        getMavenDockerBuildAction(this, {
          repositoryName,
          branch: branchParam.valueAsString,
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
        createEcsDeployAction(this, {
          serviceName: repositoryName,
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