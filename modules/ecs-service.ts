import { Construct, Duration, Stack, StackProps } from "@aws-cdk/core";
import { SubnetFilter, SubnetType } from '@aws-cdk/aws-ec2';
import { IRepository } from '@aws-cdk/aws-ecr';
import * as ecs from '@aws-cdk/aws-ecs';

import { toValidConstructName } from '../lib/util';
import { environmentConfig } from "../lib/config";
import { RetentionDays } from "@aws-cdk/aws-logs";
import { AwsLogDriverMode } from "@aws-cdk/aws-ecs";
import { BuildSpec, PipelineProject } from "@aws-cdk/aws-codebuild";
import { codeBuildSpecVersion, defaultCodeBuildEnvironment } from "../lib/constants";
import { CodeBuildAction } from "@aws-cdk/aws-codepipeline-actions";
import { Artifact } from "@aws-cdk/aws-codepipeline";
import { CommonCommands } from "../lib/commands";

interface parameters extends StackProps {
  serviceName: string
  hasLoadbalancer?: boolean,
  ephemeralStorageGiB?: number
  cluster: ecs.ICluster
  cpu?: string
  mem?: string
  version?: string
  taskCount?: number
  ecrRepository: IRepository
  environmentConfig: environmentConfig
  excludeVolumes?: boolean
}

const defaultCPU: number = 256;
const defaultMEM: number = 512;
const defaultTaskCount: number = 2;

export const createEcsService = (scope: Construct, props: parameters): EcsServiceStack => {
  return new EcsServiceStack(scope, `${toValidConstructName(props.serviceName)}Service`, props);
};

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

const getTaskDefinition = (scope: Construct, props: parameters): ecs.TaskDefinition => {
  const targetDefinition =  new ecs.TaskDefinition(scope, `${toValidConstructName(props.serviceName)}TaskDefinition`, {
    compatibility: ecs.Compatibility.FARGATE,
    cpu: props.cpu ?? defaultCPU.toString(),
    memoryMiB: props.mem ?? defaultMEM.toString(),
    family: props.serviceName,
    networkMode: ecs.NetworkMode.AWS_VPC,
    volumes: props.excludeVolumes ? [] : defaultContainerVolumes,
  });

  const logging = new ecs.AwsLogDriver({
    streamPrefix: props.serviceName,
    logRetention: RetentionDays.TWO_MONTHS,
    multilinePattern: '^\t.*',
    mode: AwsLogDriverMode.NON_BLOCKING,
  });

  targetDefinition.addContainer(`${toValidConstructName(props.serviceName)}TaskContainer`, {
    image: ecs.ContainerImage.fromEcrRepository(props.ecrRepository, props.version),
    containerName: props.serviceName,
    startTimeout: Duration.minutes(15),
    stopTimeout: Duration.minutes(5),
    essential: true,
    environment: {
      'TZ': 'Africa/Johannesburg'
    }
  });

  return targetDefinition;
}

class EcsServiceStack extends Stack {
  service: ecs.FargateService;

  constructor(scope: Construct, id: string, props: parameters) {
    super(scope, id, props);

    this.service = new ecs.FargateService(this, `${toValidConstructName(props.serviceName)}FargateService`, {
      serviceName: props.serviceName,
      cluster: props.cluster,
      assignPublicIp: false,
      maxHealthyPercent: 200,
      minHealthyPercent: 100,
      desiredCount: props.taskCount ?? defaultTaskCount,
      platformVersion: ecs.FargatePlatformVersion.LATEST,
      propagateTags: ecs.PropagatedTagSource.SERVICE,
      vpcSubnets: {
        subnetType: SubnetType.PRIVATE,
        subnetFilters: [SubnetFilter.byIds(props.environmentConfig.subnetIds)],
        availabilityZones: props.environmentConfig.availabilityZones,
      },
      enableExecuteCommand: true, // TODO -> disable once we confirm logs are coming through
      circuitBreaker: { rollback: true },
      deploymentController: { type: ecs.DeploymentControllerType.CODE_DEPLOY },
      taskDefinition: getTaskDefinition(this, props),
    });
  }
};

interface deployParameters {
  serviceName: string
  branch: string
  inputArtifact: Artifact
}

export const createEcsDeployAction = (scope: Construct, props: deployParameters): CodeBuildAction => {
  const buildAction = new CodeBuildAction({
    actionName: 'Ecs_Deploy',
    input: props.inputArtifact,
    project: createCodeBuildEcsDeploy(scope, props),
  });

  return buildAction;
};


const createCodeBuildEcsDeploy = (scope: Construct, props: deployParameters): PipelineProject => {
  const buildProject = new PipelineProject(scope, `${toValidConstructName(props.serviceName)}CodeBuildEcsDeployProject`, {
    projectName: `${props.serviceName}-${props.branch}-deploy`,
    buildSpec: getEcsCDKDeployBuildSpec(),
    environment: defaultCodeBuildEnvironment,
  });

  return buildProject;
}

const getEcsCDKDeployBuildSpec = (): BuildSpec => {
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
        ]
      }
    },
  });

  return buildSpec;
};