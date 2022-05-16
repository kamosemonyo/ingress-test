import { BuildSpec, PipelineProject } from "aws-cdk-lib/aws-codebuild";
import { Artifact, Pipeline } from "aws-cdk-lib/aws-codepipeline";
import { CodeBuildAction, CodeBuildActionProps } from "aws-cdk-lib/aws-codepipeline-actions";
import { Role } from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import { CommonCommands } from "../lib/commands";
import { codeBuildSpecVersion, defaultCodeBuildEnvironment, ENV_PRE, GITHUB_ORG, GITHUB_TOKEN_SECRET_NAME } from "../lib/constants";
import { toValidConstructName } from "../lib/util";
import { MoneyRoleBuilder } from "./money-role-builder";

export interface parameters {
  repositoryName: string,
  githubOrg: string,
  branch: string,
  account: string,
  region: string,
  input: Artifact
}

export const updateClusterProject = (scope: Construct, props: parameters) => {
  const projectName = `${props.repositoryName}-${props.branch}-update`;
  const stageName = `${toValidConstructName(props.repositoryName)}MavenDockerCodeUpdateProject`;
  const role = MoneyRoleBuilder.buildUpdateRole(scope, props.repositoryName, props.account, props.region)

  return new CodeBuildAction({
    
    actionName: 'Update_Cluster',
    input: props.input,
    project: new PipelineProject(scope, stageName, {
      role: role,
      projectName: projectName,
      environment: defaultCodeBuildEnvironment,
      buildSpec: updateClusterSpec(props),
    })
  });
}

const updateClusterSpec = (props: parameters): BuildSpec => {
  const buildSpec = BuildSpec.fromObject({
    version: codeBuildSpecVersion,
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
          ...CommonCommands.updateCluster(props.repositoryName, ENV_PRE, props.githubOrg)
        ]
      }
    },
    artifacts: {},
});

return buildSpec;
};
