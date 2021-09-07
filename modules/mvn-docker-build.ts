import { Construct } from '@aws-cdk/core';
import { Effect, PolicyStatement, ServicePrincipal } from '@aws-cdk/aws-iam';
import { CodeBuildAction } from "@aws-cdk/aws-codepipeline-actions";
import { BuildSpec, PipelineProject } from '@aws-cdk/aws-codebuild';
import { Artifact } from '@aws-cdk/aws-codepipeline';
import { toValidConstructName } from '../lib/util';
import { codeBuildSpecVersion, defaultCodeBuildEnvironment } from '../lib/constants';

interface parameters {
  branch: string
  repositoryName: string
  propertiesFilePath: string
  pomFilePath: string
  ecrRegion: string
  ecrAccount: string,
  inputArtifact: Artifact
  outputArtifact: Artifact
};

export const getMavenDockerBuildAction = (scope: Construct, params: parameters): CodeBuildAction => {
  const buildAction = new CodeBuildAction({
    actionName: 'Maven_Docker_Build',
    input: params.inputArtifact,
    outputs: [params.outputArtifact],
    project: getMavenDockerBuildProject(scope, params),
  });

  return buildAction;
};


const getMavenDockerBuildProject = (scope: Construct, params: parameters): PipelineProject => {
  const buildProject = new PipelineProject(scope, `${toValidConstructName(params.repositoryName)}CodeBuildProject`, {
    projectName: `${params.repositoryName}-${params.branch}-build`,
    buildSpec: getMavenDockerBuildSpec(params),
    environment: defaultCodeBuildEnvironment,
  });

  buildProject.addToRolePolicy(new PolicyStatement({
    effect: Effect.ALLOW,
    actions: [
      'ecr:BatchGetImage',
      'ecr:BatchCheckLayerAvailability',
      'ecr:GetDownloadUrlForLayer'
    ],
    resources: [
      `${params.ecrAccount}.dkr.ecr.${params.ecrRegion}.amazonaws.com/${params.repositoryName}`
    ]
  }));
  
  return buildProject;
}

const getMavenDockerBuildSpec = (params: parameters): BuildSpec => {
  const buildSpec = BuildSpec.fromObject({
    version: codeBuildSpecVersion,
    phases: {
      install: {
        runtime_versions: {
          java: 'corretto8'
        }
      },
      build: {
        commands: [
          'java -version',
          'mvn -version',
          'mvn clean install',
          `cp ${params.propertiesFilePath} docker/files`,
          `export VERSION=\`grep -oP \'version=\\K.*\' ${params.propertiesFilePath}\``,
          'echo $VERSION > VERSION',
          `docker build -t ${params.ecrAccount}.dkr.ecr.${params.ecrRegion}.amazonaws.com/${params.repositoryName}:$VERSION .`,
          `aws ecr get-login-password --region ${params.ecrRegion} | docker login --username AWS --password-stdin ${params.ecrAccount}.dkr.ecr.${params.ecrRegion}.amazonaws.com`,
          `docker push ${params.ecrAccount}.dkr.ecr.${params.ecrRegion}.amazonaws.com/${params.repositoryName}:$VERSION`,
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
