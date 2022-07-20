import { BuildSpec, PipelineProject } from "aws-cdk-lib/aws-codebuild"
import { Artifact } from "aws-cdk-lib/aws-codepipeline"
import { CodeBuildAction } from "aws-cdk-lib/aws-codepipeline-actions"
import { IVpc } from "aws-cdk-lib/aws-ec2"
import { Construct } from "constructs"
import { CODE_BUILD_SPEC_VERSION, DEFAULT_CODE_BUILD_ENVIRONMENT, GITHUB_ORG, GITHUB_TOKEN_SECRET_NAME } from "../../lib/constants"
import { toValidConstructName } from "../../lib/util"
import { MoneyTags, MoneyTagType } from "../../tags/tags"
import { K8sDeployProps } from "../k8sdeploy"
import { MoneyRoleBuilder } from "../money-role-builder"


interface AngularDockerBuildProps {
  vpc: IVpc
  branch: string
  repositoryName: string
  propertiesFilePath: string
  pomFilePath?: string
  account: string
  region: string
  inputArtifact: Artifact
  outputArtifact?: Artifact
  environment: string
  githubOrgName: string
  host?:string
  path?:string
};

export const createAngularDockerBuildAction = (scope: Construct, params: AngularDockerBuildProps): CodeBuildAction => {
  const buildAction = new CodeBuildAction({
    actionName: `Docker_Build_${params.environment}`,
    input: params.inputArtifact,
    project: createKongDockerBuildProject(scope, params),
  });

  MoneyTags.addTag(MoneyTagType.PIPELINE_RESOURCE, buildAction);
  MoneyTags.addTag(MoneyTagType.BUILD_RESOURCE, buildAction);
  MoneyTags.addTag(MoneyTagType.JAVA_SERVICE, buildAction);

  return buildAction;
};

const createKongDockerBuildProject = (scope: Construct, params: AngularDockerBuildProps): PipelineProject => {
  const projectName = `${params.repositoryName}-${params.branch}-build-stage`;
  const role = MoneyRoleBuilder.buildCodeBuildRole(
    scope,
    params.environment,
    params.repositoryName,
    params.account,
    params.region
  );

  const stageName = `${toValidConstructName(params.repositoryName)}KongDockerCodeBuildProjectStage${params.environment}`;
  const buildProject = new PipelineProject(scope, stageName, {
    role: role,
    vpc: params.vpc,
    projectName: projectName,
    buildSpec: buildKongDockerBuildSpec(params),
    environment: DEFAULT_CODE_BUILD_ENVIRONMENT,
    subnetSelection: {
      onePerAz: true,
    },
  });
  
  return buildProject;
}


const buildKongDockerBuildSpec = (params: AngularDockerBuildProps): BuildSpec => {
  const buildCommandParams:K8sDeployProps = {
    account: params.account,
    environment: params.environment,
    propertiesFilePath: params.propertiesFilePath,
    repositoryName: params.repositoryName,
    githubOrgName: GITHUB_ORG
  } 

  const buildSpec = BuildSpec.fromObject({
    version: CODE_BUILD_SPEC_VERSION,
    env: {
      'secrets-manager': {
        GITHUB_AUTH_TOKEN: GITHUB_TOKEN_SECRET_NAME
      }
    },
    phases: {
      'runtime-versions': {
        nodejs: '12'
      },
      pre_build: {
        commands: [
          'npm install -g @angular/cli@latest',
          'npm i',
          'ng test',
        ]
      },
      build: {
        commands: [
          `ng build --aot=false --deploy-url /${params.path}/ --baseHref=/${params.path}/ --configuration=${params.environment}`
        ]
      }
    },
    artifacts: {
      files: [
        'VERSION',
        'ROLLBACK_VERSION',
        params.propertiesFilePath,
      ],
    }
  });

  return buildSpec;
};
