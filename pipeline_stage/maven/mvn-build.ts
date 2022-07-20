import { Construct } from 'constructs';
import { IVpc } from 'aws-cdk-lib/aws-ec2';
import { CodeBuildAction } from "aws-cdk-lib/aws-codepipeline-actions";
import { BuildSpec, PipelineProject } from 'aws-cdk-lib/aws-codebuild';
import { Artifact } from 'aws-cdk-lib/aws-codepipeline';

import { toValidConstructName } from '../../lib/util';
import { Shell } from '../../lib/shell';

import * as consts from '../../lib/constants';
import { MoneyRoleBuilder } from '../money-role-builder';
import { MoneyTags, MoneyTagType } from '../../tags/tags';

interface MavenDockerBuildProps {
  vpc: IVpc
  branch: string
  repositoryName: string
  propertiesFilePath: string
  pomFilePath: string
  account: string
  region: string
  inputArtifact: Artifact
  outputArtifact: Artifact
  environment: string
  githubOrgName: string
};

export const createMavenDockerBuildAction = (scope: Construct, params: MavenDockerBuildProps): CodeBuildAction => {
  const buildAction = new CodeBuildAction({
    actionName: 'Docker_Maven_Build',
    input: params.inputArtifact,
    outputs: [params.outputArtifact],
    project: createMavenDockerBuildProject(scope, params),
  });

  MoneyTags.addTag(MoneyTagType.PIPELINE_RESOURCE, buildAction);
  MoneyTags.addTag(MoneyTagType.BUILD_RESOURCE, buildAction);
  MoneyTags.addTag(MoneyTagType.JAVA_SERVICE, buildAction);

  return buildAction;
};

const createMavenDockerBuildProject = (scope: Construct, params: MavenDockerBuildProps): PipelineProject => {
  const projectName = `${params.repositoryName}-${params.branch}-build-stage`;
  const role = MoneyRoleBuilder.buildCodeBuildRole(
    scope,
    params.environment,
    params.repositoryName,
    params.account,
    params.region
  );

  const stageName = `${toValidConstructName(params.repositoryName)}MavenDockerCodeBuildProjectStage`;
  const buildProject = new PipelineProject(scope, stageName, {
    role: role,
    vpc: params.vpc,
    projectName: projectName,
    buildSpec: buildMavenDockerBuildSpec(params),
    environment: consts.DEFAULT_CODE_BUILD_ENVIRONMENT,
    subnetSelection: {
      onePerAz: true,
    },
  });
  
  return buildProject;
}

const buildMavenDockerBuildSpec = (params: MavenDockerBuildProps): BuildSpec => {

  const buildSpec = BuildSpec.fromObject({
    version: consts.CODE_BUILD_SPEC_VERSION,
    env: {
      'secrets-manager': {
        GITHUB_AUTH_TOKEN: consts.GITHUB_TOKEN_SECRET_NAME
      }
    },
    phases: {
      install: {
        'runtime-versions': {
          java: 'corretto8'
        }
      },
      pre_build: {
        commands: [
          Shell.javaVersion(),
          Shell.mvnVersion(),
          // Create ~/.m2/settings.xml file
          ...Shell.setupMvnSettings(params.region),
          `export ROLLBACK_VERSION=$(mvn org.apache.maven.plugins:maven-help-plugin:2.1.1:evaluate -Dexpression=project.version | sed -n -e '/^\\[.*\\]/ !{ /^[0-9]/ { p; q } }')`,
          `echo "Resolved current version $ROLLBACK_VERSION"`,
          'echo $ROLLBACK_VERSION > ROLLBACK_VERSION',
          // Calculate next release version
          // `mvn -f ${params.pomFilePath} build-helper:parse-version versions:set -DnewVersion='\${parsedVersion.majorVersion}.\${parsedVersion.nextMinorVersion}.'0 versions:commit`,
          // Maven build
        ]
      },
      build: {
        commands: [
          Shell.mvnCleanInstall(),
          ...Shell.setVersionFromFile(params.propertiesFilePath),
          // Deploy Maven artifacts for version
          // Shell.mvnDeploy(),
        ]
      }
    },
    artifacts: {
      files: [
        'VERSION',
        'ROLLBACK_VERSION',
        params.propertiesFilePath,
      ],
    },
    cache: {
      paths: ['/root/.m2/**/*'],
    }
  });

  return buildSpec;
};
