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
import { kongBuildImageCommand, kongDeployImageCommand, kongDeployToK8s, kongVersionCommand } from "./kong-commands"


interface KongDockerBuildProps {
    vpc: IVpc
    branch: string
    repositoryName: string
    propertiesFilePath: string
    account: string
    region: string
    inputArtifact: Artifact
    environment: string
    githubOrgName: string,
    host?:string
};
  
export const createKongDeployAction = (scope: Construct, params: KongDockerBuildProps): CodeBuildAction => {
  const buildAction = new CodeBuildAction({
    actionName: `Docker_Deploy_${params.repositoryName}_${params.environment}`,
    input: params.inputArtifact,
    project: createKongDeployBuildProject(scope, params),
  });

  MoneyTags.addTag(MoneyTagType.PIPELINE_RESOURCE, buildAction);
  MoneyTags.addTag(MoneyTagType.BUILD_RESOURCE, buildAction);
  MoneyTags.addTag(MoneyTagType.KONG_SERVICE, buildAction);

return buildAction;
};
  
const createKongDeployBuildProject = (scope: Construct, params: KongDockerBuildProps): PipelineProject => {
  const projectName = `${params.repositoryName}-${params.environment}-deploy-stage`;
  const role = MoneyRoleBuilder.buildEksDeployRole(
    scope,
    params.environment,
    params.repositoryName,
    params.account
  );

  const stageName = `${toValidConstructName(params.repositoryName)}KongDeployStage${params.environment}`;
  const buildProject = new PipelineProject(scope, stageName, {
    role: role,
    vpc: params.vpc,
    projectName: projectName,
    buildSpec: kongDeployImageSpec(params),
    environment: DEFAULT_CODE_BUILD_ENVIRONMENT,
    subnetSelection: {
    onePerAz: true,
    },
  });

  return buildProject;
}
  
const kongDeployImageSpec = (params: KongDockerBuildProps): BuildSpec => {
  if (params.host == undefined) {
    throw Error(`host not provided for ${params.repositoryName}`)
  }

  const buildCommandParams:K8sDeployProps = {
    account: params.account,
    environment: params.environment,
    propertiesFilePath: params.propertiesFilePath,
    repositoryName: params.repositoryName,
    host: params.host,
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
      install: {},
      pre_build: {
        commands: []
      },
      build: {
        commands: [
          ...kongVersionCommand(buildCommandParams),
          ...kongBuildImageCommand(buildCommandParams),
          ...kongDeployImageCommand(buildCommandParams),
        ]
      },
      post_build: {
        commands: [
          ...kongDeployToK8s(buildCommandParams)
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
