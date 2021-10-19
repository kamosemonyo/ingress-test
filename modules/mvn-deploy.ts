import { Construct } from '@aws-cdk/core';
import { Effect, PolicyStatement } from '@aws-cdk/aws-iam';
import { CodeBuildAction } from "@aws-cdk/aws-codepipeline-actions";
import { BuildSpec, PipelineProject } from '@aws-cdk/aws-codebuild';
import { Artifact } from '@aws-cdk/aws-codepipeline';
import { toValidConstructName } from '../lib/util';
import { codeBuildSpecVersion, defaultCodeBuildEnvironment, mainGitBranch, nexusRepository } from '../lib/constants';
import { IVpc } from '@aws-cdk/aws-ec2';
import { CommonCommands } from '../lib/commands';

interface parameters {
  branch: string
  repositoryName: string
  propertiesFilePath: string
  pomFilePath: string
  ssmRegion: string
  ssmAccount: string,
  inputArtifact: Artifact
  outputArtifact: Artifact
  vpc?: IVpc,
};

export const createMavenDeployAction = (scope: Construct, params: parameters): CodeBuildAction => {
  const buildAction = new CodeBuildAction({
    actionName: 'Maven_Deploy',
    input: params.inputArtifact,
    outputs: [params.outputArtifact],
    project: createMavenDeployProject(scope, params),
  });

  return buildAction;
};

const createMavenDeployProject = (scope: Construct, params: parameters): PipelineProject => {
  const buildProject = new PipelineProject(scope, `${toValidConstructName(params.repositoryName)}CodeBuildProject`, {
    projectName: `${params.repositoryName}-${params.branch}-build`,
    buildSpec: buildMavenDeploySpec(params),
    environment: defaultCodeBuildEnvironment,
    vpc: params.vpc,
  });

  buildProject.addToRolePolicy(new PolicyStatement({
    effect: Effect.ALLOW,
    actions: [
      'ssm:DescribeParameters',
      'ssm:GetParameter',
      'ssm:GetParameters',
      'ssm:GetParametersByPath',
      'ssm:GetParameterHistory',
      'kms:Decrypt'
    ],
    resources: [
      `arn:aws:ssm:${params.ssmRegion ?? '*'}:${params.ssmAccount ?? '*'}:parameter/mmi/nexus/password`,
      `arn:aws:ssm:${params.ssmRegion ?? '*'}:${params.ssmAccount ?? '*'}:parameter/mmi/nexus/username`,
      `arn:aws:kms:${params.ssmRegion ?? '*'}:${params.ssmAccount ?? '*'}:key/*`,
    ]
  }));

  return buildProject;
}

const buildMavenDeploySpec = (params: parameters): BuildSpec => {
  const buildSpec = BuildSpec.fromObject({
    version: codeBuildSpecVersion,
    phases: {
      install: {
        runtime_versions: {
          java: 'corretto8'
        },
        commands: [
          ...CommonCommands.installJq,
        ]
      },
      build: {
        commands: [
          'java -version',
          'mvn -version',
          ...CommonCommands.setupMvnSettings(params.ssmRegion),
          'mvn deploy',
        ]
      }
    },
    artifacts: {
      files: [
        'VERSION',
        params.propertiesFilePath,
      ],
    },    
  });

  return buildSpec;
};


