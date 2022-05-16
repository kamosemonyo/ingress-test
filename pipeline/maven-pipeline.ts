import { Construct  } from "constructs";
import { CfnParameter, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import { aws_s3 as s3 } from 'aws-cdk-lib';
import { aws_codepipeline as codepipeline } from "aws-cdk-lib";
import { aws_ec2 as ec2 } from "aws-cdk-lib";

import { createEcrRepository } from "../pipeline_stage/ecr-repository";
import { getSourceAction } from "../pipeline_stage/code-source";
import { toValidConstructName } from "../lib/util";
import { CODE_BUILD_VPC_NAME, EKS_NON_PROD_CLUSTER_NAME, ENV_PRE, mainGitBranch } from "../lib/constants";
import { createMavenDeployAction, createMavenDockerBuildAction, createMavenRelease } from "../pipeline_stage/maven/mvn-build";
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { updateClusterProject } from "../pipeline_stage/update-cluster";

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

    const sourceCodeArtifact = new codepipeline.Artifact();
    const buildOutputArtifact = new codepipeline.Artifact();


    const pipeline = new codepipeline.Pipeline(this, `${toValidConstructName(repositoryName)}Pipeline`, {
      restartExecutionOnUpdate: true,
      pipelineName: `${repositoryName}-${branch}`,
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
          environment: ENV_PRE,
          githubOrgName: githubOrgParam.valueAsString
        }),
      ],
    })

    pipeline.addStage({
      stageName: 'Update',
      actions: [
        updateClusterProject(this, {
          input: buildOutputArtifact,
          account: Stack.of(this).account,
          region: Stack.of(this).region,
          branch: branch,
          githubOrg: githubOrgParam.valueAsString,
          repositoryName: repositoryName
        })
      ]
    })

    // pipeline.addStage({
    //   stageName: 'Publish',
    //   actions: [
    //     createMavenRelease(this, {
    //       branch,
    //       repositoryName,
    //       region: Stack.of(this).region,
    //       account: Stack.of(this).account,
    //       pomFilePath: pomFile,
    //       githubOrgName: githubOrgParam.valueAsString,
    //       extraInputs: [ buildOutputArtifact ],
    //       inputArtifact: sourceCodeArtifact,
    //       environment: ENV_PRE
    //     })
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
