import { Construct } from 'constructs';
import { CodeBuildAction } from "aws-cdk-lib/aws-codepipeline-actions";
import { BuildSpec, PipelineProject } from 'aws-cdk-lib/aws-codebuild';
import { Artifact } from 'aws-cdk-lib/aws-codepipeline';
import { toValidConstructName } from '../../lib/util';
import { CODE_BUILD_SPEC_VERSION, DEFAULT_CODE_BUILD_ENVIRONMENT, EKS_DEPLOY_ROLE, MAIN_GIT_BRANCH, NEXUS_REPOSITORY } from '../../lib/constants';
import { IVpc } from 'aws-cdk-lib/aws-ec2';
import { CommonCommands } from '../../lib/commands';
import { IPrincipal } from 'aws-cdk-lib/aws-iam';

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
  pipelineRole: IPrincipal
};

const createMavenDeployAction = (scope: Construct, params: parameters): CodeBuildAction => {
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
    projectName: `${params.repositoryName}-${params.branch}-deploy`,
    buildSpec: buildMavenDeploySpec(params),
    environment: DEFAULT_CODE_BUILD_ENVIRONMENT,
    vpc: params.vpc,
  });

  return buildProject;
}

const buildMavenDeploySpec = (params: parameters): BuildSpec => {
  const buildSpec = BuildSpec.fromObject({
    version: CODE_BUILD_SPEC_VERSION,
    phases: {
      install: {
        runtime_versions: {
          java: 'corretto8'
        },
        commands: [
          ...CommonCommands.installYq(),
        ]
      },
      build: {
        commands: [
          'java -version',
          'mvn -version',
          ...CommonCommands.setupMvnSettings(params.ssmRegion),
          'mvn deploy',
        ]
      },
      post_build: {
        commands: [
          ...CommonCommands.assumeAwsRole(EKS_DEPLOY_ROLE),
          'aws eks update-kubeconfig --name non-prod --region af-south-1',
          `kubectl apply -f ingress.yaml`
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


