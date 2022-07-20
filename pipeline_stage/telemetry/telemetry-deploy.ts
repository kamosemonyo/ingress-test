import { BuildSpec, PipelineProject } from "aws-cdk-lib/aws-codebuild"
import { Artifact } from "aws-cdk-lib/aws-codepipeline"
import { CodeBuildAction } from "aws-cdk-lib/aws-codepipeline-actions"
import { IVpc } from "aws-cdk-lib/aws-ec2"
import { Construct } from "constructs"
import { TELEMETRY_VERSION } from "../../deployment_templates/constants"
import { CODE_BUILD_SPEC_VERSION, DEFAULT_CODE_BUILD_ENVIRONMENT, DEV_VERSION, ECR_REGION, EKS_DEPLOY_ROLE, GITHUB_TOKEN_SECRET_NAME, K8S_TEMPLATES_BUCKET_NAME, RELEASE_VERSION, TELEMETRY_TEMPLATES_BUCKET_NAME } from "../../lib/constants"
import { Kubectl } from "../../lib/kubctl"
import { Shell } from "../../lib/shell"
import { getClusterName, toValidConstructName } from "../../lib/util"
import { MoneyTags, MoneyTagType } from "../../tags/tags"
import { MoneyRoleBuilder } from "../money-role-builder"


interface TelemetryDockerBuildProps {
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

  
export const createTelemetryDeployAction = (scope: Construct, params: TelemetryDockerBuildProps): CodeBuildAction => {
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

const createAngularDeployBuildProject = (scope: Construct, params: TelemetryDockerBuildProps): PipelineProject => {
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
  
const kongDeployImageSpec = (params: TelemetryDockerBuildProps): BuildSpec => {
  if (params.host == undefined) {
    throw Error(`host not provided for ${params.repositoryName}`)
  }

  const folder = '.service'
  const clusterName = getClusterName(params.environment)

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
      install: {},
      pre_build: {
        commands: [
          Shell.envbustVersion()
        ]
      },
      build: {
        commands: [
          Shell.setEnvironmentVar(DEV_VERSION, TELEMETRY_VERSION),
          Shell.setEnvironmentVar(RELEASE_VERSION, TELEMETRY_VERSION),
          ...Shell.dockerBuildAndDeploy(params)
        ]
      },
      post_build: {
        commands: [
            Shell.s3DownloadFolder(TELEMETRY_TEMPLATES_BUCKET_NAME, folder),
            // Populate placeholder environment variables on templates
            ...Shell.setDeploymentEnvs({
              env: params.environment,
              account: params.account,
              region: ECR_REGION,
              namespace: params.environment,
              service: params.repositoryName,
              version: RELEASE_VERSION,
              hostname: params.host
            }),
            // Create deployment manifest file
            Shell.replaceEnvPlaceHolderValues(`${folder}/telegraph.yml`),
            Shell.printFileContents(`${folder}/telegraph.yml`),
            // Deploy to cluster
            ...Shell.assumeAwsRole(EKS_DEPLOY_ROLE),
            Kubectl.login(clusterName),
            Kubectl.applyFolder(folder)
            
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
