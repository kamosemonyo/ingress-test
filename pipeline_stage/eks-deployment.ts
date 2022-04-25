import { Construct } from "constructs";

import { toValidConstructName } from '../lib/util';
import { BuildSpec, PipelineProject } from "aws-cdk-lib/aws-codebuild";
import { codeBuildSpecVersion, defaultCodeBuildEnvironment } from "../lib/constants";
import { CodeBuildAction } from "aws-cdk-lib/aws-codepipeline-actions";
import { Artifact } from "aws-cdk-lib/aws-codepipeline";
import { CommonCommands } from "../lib/commands";


const defaultCPU: number = 256;
const defaultMEM: number = 512;
const defaultTaskCount: number = 2;

const defaultContainerVolumes = [
  {
    name: 'timezone-config',
    host: {
      sourcePath: '/etc/localtime'
    }
  },
  {
    name: 'wildfly-data',
    host: {
      sourcePath: '/opt/wildfly/standalone/data'
    }
  },
  {
    name: 'wildfly-log',
    host: {
      sourcePath: '/opt/wildfly/standalone/log'
    }
  },
  {
    name: 'wildfly-tmp',
    host: {
      sourcePath: '/opt/wildfly/standalone/tmp'
    }
  },
];

interface deployParameters {
  project: string
  branch: string
  environment: string
  replicas: number
  inputArtifact: Artifact
}

export const createEksDeployAction = (scope: Construct, props: deployParameters): CodeBuildAction => {
  const buildAction = new CodeBuildAction({
    actionName: 'Ecs_Deploy',
    input: props.inputArtifact,
    project: createCodeBuildEksDeploy(scope, props),
  });

  return buildAction;
};

const createCodeBuildEksDeploy = (scope: Construct, props: deployParameters): PipelineProject => {
  const buildProject = new PipelineProject(scope, `${toValidConstructName(props.project)}CodeBuildEcsDeployProject`, {
    projectName: `${props.project}-${props.branch}-deploy`,
    buildSpec: getEksCDKDeployBuildSpec(props),
    environment: defaultCodeBuildEnvironment,
  });

  return buildProject;
}

const getEksCDKDeployBuildSpec = (props: deployParameters): BuildSpec => {
  const buildSpec = BuildSpec.fromObject({
    version: codeBuildSpecVersion,
    phases: {
      install: {
        commands: [
          ...CommonCommands.debugEnvCmd,
          ...CommonCommands.installCdkCmd,
        ]
      },
      build: {
        commands: [
          'ls -al $CODEBUILD_SRC_DIR_Artifact_Build_Docker_Build',
          `export VERSION=$(cat $CODEBUILD_SRC_DIR_Artifact_Build_Docker_Build)`,
          'export VERSION_WITHOUT_DOTS=${VERSION//./}',
          '',
          `cdk deploy -c template=eks-service-deploy \
          --parameters proejct=${props.project} \
          --parameters selector=${props.project}-$VERSION_WITHOUT_DOTS \
          --parameters environment=${props.environment} \
          --parameters replicas=${props.replicas} \
          --parameters tag=$VERSION \
          --all`
        ]
      }
    },
  });

  return buildSpec;
};