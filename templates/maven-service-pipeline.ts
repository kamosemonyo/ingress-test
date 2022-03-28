import { Construct  } from "constructs";
import { CfnParameter, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import { aws_s3 as s3 } from 'aws-cdk-lib';
import { aws_codepipeline as codepipeline } from "aws-cdk-lib";
import { aws_ec2 as ec2 } from "aws-cdk-lib";

import { createEcrRepository } from "../modules/ecr-repository";
import { getSourceAction } from "../modules/code-source";
import { toValidConstructName } from "../lib/util";
import { CODE_BUILD_VPC_NAME, EKS_NON_PROD_CLUSTER_NAME, mainGitBranch } from "../lib/constants";
import { createMavenDeployAction, createMavenDockerBuildAction, createMavenRelease } from "../modules/mvn-docker-build";
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";

interface stackProps extends StackProps {
  repositoryName:string,
  propertiesFile:string,
  replicas: Number
}

export class MavenServicePipeline extends Stack {
  constructor(scope: Construct, id: string, props: stackProps) {
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

    const propertiesFilePathParam = new CfnParameter(this, 'propertiesFile', {
      type: 'String',
      description: 'pom.properties file path',
      default: props.propertiesFile,
    });

    // const pomFilePathParam = new CfnParameter(this, 'pomFile', {
    //   type: 'String',
    //   description: 'pom.xml file path',
    //   default: process.env.POM_FILE ?? 'pom.xml',
    // });

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
    const branch: string = mainGitBranch;
    const pomFile = 'pom.xml'

    if (!repositoryName) {
      throw Error('Expected context [repositoryName] to be defined.');
    }

    const ecrRepository = createEcrRepository(this, { repositoryName });

    this.exportValue(ecrRepository.repositoryName, { name: `${props.repositoryName}-ecr-repository` });
    this.exportValue(ecrRepository.repositoryArn, { name: `${props.repositoryName}-ecr-repository-arn` });
    this.exportValue(ecrRepository.repositoryUri, { name: `${props.repositoryName}-ecr-repository-uri` });

    const sourceCodeArtifact = new codepipeline.Artifact();
    const buildOutputArtifact = new codepipeline.Artifact();


    const pipeline = new codepipeline.Pipeline(this, `${toValidConstructName(repositoryName)}Pipeline`, {
      restartExecutionOnUpdate: true,
      pipelineName: `${repositoryName}-${branch}`,
      artifactBucket: artifactsBucket,
    });

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
          pipelineRole: pipeline.role,
          repositoryName: repositoryName,
          account: Stack.of(this).account,
          region: Stack.of(this).region,
          propertiesFilePath: props.propertiesFile,
          pomFilePath: pomFile,
          inputArtifact: sourceCodeArtifact,
          outputArtifact: buildOutputArtifact,
          environment: 'pre'
        }),
      ],
    })

    // pipelineStages.push({
    //   stageName: 'Publish',
    //   actions: [
    //     createMavenRelease(this, {
    //       branch,
    //       repositoryName,
    //       region: Stack.of(this).region,
    //       account: Stack.of(this).account,
    //       pomFilePath: pomFilePathParam.valueAsString,
    //       githubOrgName: githubOrgParam.valueAsString,
    //       extraInputs: [ buildOutputArtifact ],
    //       inputArtifact: sourceCodeArtifact,
    //       environment: 'pre'
    //     })
    //   ],
    // });

    // const devDeployOutputArtifact = new codepipeline.Artifact();

    // pipeline.addStage({
    //   stageName: 'Deploy_Dev',
    //   actions: [
    //     createMavenDeployAction(this, {
    //       vpc,
    //       branch,
    //       repositoryName,
    //       environment: 'dev',
    //       account: Stack.of(this).account,
    //       replicas: props.replicas.toString(),
    //       clusterName: EKS_NON_PROD_CLUSTER_NAME,
    //       extraInputs: [ buildOutputArtifact ],
    //       inputArtifact: sourceCodeArtifact,
    //       outputs: [devDeployOutputArtifact],
    //       pipelineRole: pipeline.role
    //     }),
    //   ],
    // })

    // pipelineStages.push({
    //   stageName: 'Deploy_Dev',
    //   actions: [
    //     createMavenDeployAction(this, {
    //       vpc,
    //       branch,
    //       repositoryName,
    //       environment: 'dev',
    //       account: Stack.of(this).account,
    //       replicas: props.replicas.toString(),
    //       clusterName: EKS_NON_PROD_CLUSTER_NAME,
    //       extraInputs: [ buildOutputArtifact ],
    //       inputArtifact: sourceCodeArtifact,
    //       outputs: [devDeployOutputArtifact]
    //     }),
    //   ],
    // });

    // const preDeployOutputArtifact = new codepipeline.Artifact();

    // pipeline.addStage({
    //   stageName: 'Deploy_PRE',
    //   actions: [
    //     createMavenDeployAction(this, {
    //       vpc,
    //       branch,
    //       repositoryName,
    //       environment: 'preprod',
    //       clusterName: EKS_NON_PROD_CLUSTER_NAME,
    //       replicas: props.replicas.toString(),
    //       extraInputs: [ buildOutputArtifact ],
    //       account: Stack.of(this).account,
    //       inputArtifact: sourceCodeArtifact,
    //       outputs: [preDeployOutputArtifact],
    //       pipelineRole: pipeline.role
    //     }),
    //   ],
    // })

    // pipelineStages.push({
    //   stageName: 'Deploy_PRE',
    //   actions: [
    //     createMavenDeployAction(this, {
    //       vpc,
    //       branch,
    //       repositoryName,
    //       environment: 'preprod',
    //       clusterName: EKS_NON_PROD_CLUSTER_NAME,
    //       replicas: props.replicas.toString(),
    //       extraInputs: [ buildOutputArtifact ],
    //       account: Stack.of(this).account,
    //       inputArtifact: sourceCodeArtifact,
    //       outputs: [preDeployOutputArtifact]
    //     }),
    //   ],
    // });

    // pipelineStages.push({
    //   stageName: 'Deploy',
    //   actions: [
    //     createEksDeployAction(this, {
    //       project: repositoryName,
    //       replicas: replicasParam.valueAsNumber,
    //       environment: resolveEnvironment(branchParam.valueAsString),
    //       branch: branchParam.valueAsString,
    //       inputArtifact: buildOutputArtifact,
    //     }),
    //   ],
    // });
  };
}

const resolveEnvironment = (branch: string): string => {
  if (branch === mainGitBranch) {
    return 'prod';
  } else if(branch === 'release') {
    return 'preprod';
  }

  return 'dev';
}
