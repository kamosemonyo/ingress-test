import { BuildSpec, PipelineProject } from "aws-cdk-lib/aws-codebuild"
import { Artifact } from "aws-cdk-lib/aws-codepipeline"
import { CodeBuildAction } from "aws-cdk-lib/aws-codepipeline-actions"
import { IVpc } from "aws-cdk-lib/aws-ec2"
import { Construct } from "constructs"
import { CODE_BUILD_SPEC_VERSION, DEFAULT_CODE_BUILD_ENVIRONMENT, GITHUB_ORG, GITHUB_TOKEN_SECRET_NAME } from "../../lib/constants"
import { Shell } from "../../lib/shell"
import { getServiceTagVersion, toValidConstructName } from "../../lib/util"
import { MoneyTags, MoneyTagType } from "../../tags/tags"
import { deployServiceToK8s, dockerCreateBuildArgs } from "../eks-deployment"
import { MoneyRoleBuilder } from "../money-role-builder"



interface AngularDockerBuildProps {
    vpc: IVpc
    branch: string
    repositoryName: string
    propertiesFilePath: string
    account: string
    region: string
    inputArtifact: Artifact
    environment: string
    githubOrgName: string,
    host?:string,
    dockerBuildArg?:any
};

  
export const createAngularDeployAction = (scope: Construct, params: AngularDockerBuildProps): CodeBuildAction => {
  const buildAction = new CodeBuildAction({
    actionName: `Docker_Deploy_${params.repositoryName}_${params.environment}`,
    input: params.inputArtifact,
    project: createAngularDeployBuildProject(scope, params),
  });

  MoneyTags.addTag(MoneyTagType.PIPELINE_RESOURCE, buildAction);
  MoneyTags.addTag(MoneyTagType.BUILD_RESOURCE, buildAction);
  MoneyTags.addTag(MoneyTagType.ANGULAR_SERVICE, buildAction);

return buildAction;
};

const createAngularDeployBuildProject = (scope: Construct, params: AngularDockerBuildProps): PipelineProject => {
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
    buildSpec: angularDeployImageSpec(params),
    environment: DEFAULT_CODE_BUILD_ENVIRONMENT,
    subnetSelection: {
    onePerAz: true,
    },
  });

  return buildProject;
}
  
const angularDeployImageSpec = (params: AngularDockerBuildProps): BuildSpec => {

  const version = getServiceTagVersion(params.environment)
  let buildCommand = Shell.buildDockerImage(params.account, params.repositoryName, version)

  if (params.dockerBuildArg !== undefined) {
    buildCommand = buildCommand.concat(
      dockerCreateBuildArgs(params.dockerBuildArg)
    )
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
        commands: [
          Shell.envbustVersion()
        ]
      },
      build: {
        commands: [
          ...Shell.setVersionFromFile(params.propertiesFilePath),
          ...Shell.dockerBuildAndDeploy(params)
        ]
      },
      post_build: {
        commands: [
          ...Shell.eksDeployServiceToK8s({
            account: params.account,
            environment: params.environment,
            githubOrgName: GITHUB_ORG,
            propertiesFilePath: params.propertiesFilePath,
            repositoryName: params.repositoryName
          })
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
