import { BuildSpec, PipelineProject } from "aws-cdk-lib/aws-codebuild"
import { Artifact } from "aws-cdk-lib/aws-codepipeline"
import { CodeBuildAction } from "aws-cdk-lib/aws-codepipeline-actions"
import { IVpc } from "aws-cdk-lib/aws-ec2"
import { Construct } from "constructs"
import { TELEMETRY_VERSION } from "../../deployment_templates/constants"
import { CODE_BUILD_SPEC_VERSION, DEFAULT_CODE_BUILD_ENVIRONMENT, GITHUB_ORG, GITHUB_TOKEN_SECRET_NAME, RELEASE_VERSION } from "../../lib/constants"
import { Shell } from "../../lib/shell"
import { toValidConstructName } from "../../lib/util"
import { MoneyTags, MoneyTagType } from "../../tags/tags"
import { K8sDeployProps } from "../k8sdeploy"
import { MoneyRoleBuilder } from "../money-role-builder"


interface TelemetryDockerBuildProps {
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

export const createTelemetryDockerBuildAction = (scope: Construct, params: TelemetryDockerBuildProps): CodeBuildAction => {
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

const createKongDockerBuildProject = (scope: Construct, params: TelemetryDockerBuildProps): PipelineProject => {
  const projectName = `${params.repositoryName}-${params.branch}-build-stage`;
  const role = MoneyRoleBuilder.buildCodeBuildRole(
    scope,
    params.environment,
    params.repositoryName,
    params.account,
    params.region
  );

  const stageName = `${toValidConstructName(params.repositoryName)}TelemetryDockerCodeBuildProjectStage${params.environment}`;
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


const buildKongDockerBuildSpec = (params: TelemetryDockerBuildProps): BuildSpec => {
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
        python: '3.9'
      },
      pre_build: {
        commands: [
          Shell.setEnvironmentVar(RELEASE_VERSION, TELEMETRY_VERSION)
        ]
      },
      build: {
        commands: [
           Shell.buildDockerImage(params.account, params.repositoryName, RELEASE_VERSION)
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
