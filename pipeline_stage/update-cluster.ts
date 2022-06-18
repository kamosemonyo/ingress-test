import { BuildSpec, PipelineProject } from "aws-cdk-lib/aws-codebuild";
import { Artifact } from "aws-cdk-lib/aws-codepipeline";
import { CodeBuildAction } from "aws-cdk-lib/aws-codepipeline-actions";
import { Construct } from "constructs";
import { CommonCommands } from "../lib/commands";
import { CODE_BUILD_SPEC_VERSION, DEFAULT_CODE_BUILD_ENVIRONMENT, ENV_PRE, GITHUB_ORG, GITHUB_TOKEN_SECRET_NAME } from "../lib/constants";
import { toValidConstructName } from "../lib/util";
import { MoneyRoleBuilder } from "./money-role-builder";

export interface parameters {
  repositoryName: string,
  githubOrg: string,
  branch: string,
  account: string,
  region: string,
  input: Artifact,
  deployEnv: string,
}

export const updateClusterProject = (scope: Construct, props: parameters) => {
  const projectName = `${props.repositoryName}-${props.branch}-update-${props.deployEnv}`;
  const stageName = `${toValidConstructName(props.repositoryName)}${props.deployEnv}MavenDockerCodeUpdateProject`;
  const role = MoneyRoleBuilder.buildUpdateRole(scope, props.repositoryName, props.account, props.region, props.deployEnv)

  return new CodeBuildAction({
    actionName: 'Update_Cluster',
    input: props.input,
    project: new PipelineProject(scope, stageName, {
      role: role,
      projectName: projectName,
      environment: DEFAULT_CODE_BUILD_ENVIRONMENT,
      buildSpec: updateClusterSpec(props),
    })
  });
}

const updateClusterSpec = (props: parameters): BuildSpec => {
  const buildSpec = BuildSpec.fromObject({
    version: CODE_BUILD_SPEC_VERSION,
    env: {
      'secrets-manager': {
        GITHUB_AUTH_TOKEN: GITHUB_TOKEN_SECRET_NAME
      }
    },
    phases: {
      install: {
        'runtime-versions': {},
        commands: [
          ...CommonCommands.installYq(),
        ]
      },
      build: {
        commands: [
          'VERSION=$(cat VERSION)',
          'echo $VERSION',
          ...CommonCommands.updateCluster(props.repositoryName, props.deployEnv, props.githubOrg)
        ]
      }
    },
    artifacts: {},
});

return buildSpec;
};
