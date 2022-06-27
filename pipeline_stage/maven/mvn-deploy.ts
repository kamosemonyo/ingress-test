import { Construct } from 'constructs';
import { CodeBuildAction } from "aws-cdk-lib/aws-codepipeline-actions";
import { BuildSpec, PipelineProject } from 'aws-cdk-lib/aws-codebuild';
import { Artifact } from 'aws-cdk-lib/aws-codepipeline';
import { getClusterName, getServiceTagVersion, toValidConstructName } from '../../lib/util';
import { CODE_BUILD_SPEC_VERSION, DEFAULT_CODE_BUILD_ENVIRONMENT, ECR_REGION, EKS_DEPLOY_ROLE, GITHUB_HOST, GITHUB_ORG, K8S_TEMPLATES_BUCKET_NAME, MAIN_GIT_BRANCH, NEXUS_REPOSITORY } from '../../lib/constants';
import { IVpc } from 'aws-cdk-lib/aws-ec2';
import { Shell } from '../../lib/shell';
import { IPrincipal } from 'aws-cdk-lib/aws-iam';
import { K8sDeployProps } from '../k8sdeploy';
import { Kubectl } from '../../lib/kubctl';
import { Bucket } from 'aws-cdk-lib/aws-s3';

interface parameters {
  branch: string
  repositoryName: string
  propertiesFilePath: string
  pomFilePath: string
  ssmRegion: string
  ssmAccount: string,
  inputArtifact: Artifact
  outputArtifact: Artifact
  vpc?: IVpc,
  pipelineRole: IPrincipal,
  pipelineEnv:string,
  account:string
};

const createMavenDeployAction = (scope: Construct, params: parameters): CodeBuildAction => {
  const buildAction = new CodeBuildAction({
    actionName: 'Maven_Deploy',
    input: params.inputArtifact,
    outputs: [params.outputArtifact],
    project: createMavenDeployProject(scope, params),
  });

  return buildAction;
};

const createMavenDeployProject = (scope: Construct, params: parameters): PipelineProject => {
  const buildProject = new PipelineProject(scope, `${toValidConstructName(params.repositoryName)}CodeBuildProject`, {
    projectName: `${params.repositoryName}-${params.branch}-deploy`,
    buildSpec: buildMavenDeploySpec(params),
    environment: DEFAULT_CODE_BUILD_ENVIRONMENT,
    vpc: params.vpc,
  });

  const buckerId = `momentum-money-k8s-templates-${params.repositoryName}-${params.pipelineEnv}`;
  const k8sBucket = Bucket.fromBucketArn(
    scope,
    buckerId,
    `arn:aws:s3:::${K8S_TEMPLATES_BUCKET_NAME}`
  );

  k8sBucket.grantReadWrite(buildProject);

  return buildProject;
}

export function mavenDeployToK8s (params:K8sDeployProps):string[] {
  const serviceTagVersion = getServiceTagVersion(params.environment)
  const service = params.repositoryName
  const clusterName = getClusterName(params.environment)

  const folder = '.service'

  return [
    Shell.s3DownloadFolder(K8S_TEMPLATES_BUCKET_NAME, folder),
    // Populate placeholder environment variables on templates
    ...Shell.setDeploymentEnvs({
      account: params.account,
      region: ECR_REGION,
      namespace: params.environment,
      service: service,
      version: serviceTagVersion
    }),
    // Create deployment manifest file
    Shell.replaceEnvPlaceHolderValues(`${folder}/deployment.yml`),
    Shell.printFileContents(`${folder}/deployment.yml`),
    // Create service manifest files
    Shell.replaceEnvPlaceHolderValues(`${folder}/svc.yml`),
    Shell.printFileContents(`${folder}/svc.yml`),
    // Create headless service manifest file
    Shell.replaceEnvPlaceHolderValues(`${folder}/svc-headless.yml`),
    Shell.printFileContents(`${folder}/svc-headless.yml`),
    // Assume eks deploy role
    ...Shell.assumeAwsRole(EKS_DEPLOY_ROLE),
    Kubectl.login(clusterName),
    Kubectl.applyFolder(folder)
  ]
}


const buildMavenDeploySpec = (params: parameters): BuildSpec => {
  const deploySpecProps:K8sDeployProps = {
    account: params.account,
    environment: params.pipelineEnv,
    githubOrgName: GITHUB_ORG,
    propertiesFilePath: params.propertiesFilePath,
    repositoryName: params.repositoryName
  }

  const buildSpec = BuildSpec.fromObject({
    version: CODE_BUILD_SPEC_VERSION,
    phases: {
      install: {
        runtime_versions: {
          java: 'corretto8'
        },
        commands: [
          ...Shell.installYq(),
        ]
      },
      build: {
        commands: [
          'java -version',
          'mvn -version',
          ...Shell.setupMvnSettings(params.ssmRegion),
          'mvn deploy',
        ]
      },
      post_build: {
        commands: [
          ...mavenDeployToK8s({
            account: params.account,
            environment: params.pipelineEnv,
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
        params.propertiesFilePath,
      ],
    },    
  });

  return buildSpec;
};


