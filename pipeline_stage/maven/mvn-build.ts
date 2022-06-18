import { Construct } from 'constructs';
import { IVpc } from 'aws-cdk-lib/aws-ec2';
import { CodeBuildAction, CodeBuildActionProps } from "aws-cdk-lib/aws-codepipeline-actions";
import { BuildSpec, PipelineProject } from 'aws-cdk-lib/aws-codebuild';
import { Artifact } from 'aws-cdk-lib/aws-codepipeline';

import { toValidConstructName } from '../../lib/util';
import { CommonCommands } from '../../lib/commands';

import * as consts from '../../lib/constants';
import { MoneyRoleBuilder } from '../money-role-builder';
import { aws_s3 } from 'aws-cdk-lib';
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
          'java -version',
          'mvn -version',
          // Create ~/.m2/settings.xml file
          ...CommonCommands.setupMvnSettings(params.region),
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
          'mvn clean install',
          `export SNAPSHOT_VERSION=\`grep -oP \'version=\\K.*\' ${params.propertiesFilePath}\``,
          `echo "current new snapshot version $SNAPSHOT_VERSION"`,
          'export VERSION=$(echo ${SNAPSHOT_VERSION} |awk -F "-" \'{print $1}\')',
          'echo "Resolved new version $VERSION"',
          'echo $VERSION > VERSION',
          `cp ${params.propertiesFilePath} docker/files`,
          // Deploy Maven artifacts for version
          // 'mvn deploy',
        ]
      },
      post_build: {
        commands: [
          // Build and push docker image for version snapshot
          `aws ecr get-login-password --region ${consts.ECR_REGION} | docker login --username AWS --password-stdin ${params.account}.dkr.ecr.${consts.ECR_REGION}.amazonaws.com`,
          `docker build -t ${params.account}.dkr.ecr.${consts.ECR_REGION}.amazonaws.com/${params.repositoryName}:$SNAPSHOT_VERSION -t ${params.account}.dkr.ecr.${consts.ECR_REGION}.amazonaws.com/${params.repositoryName}:$VERSION .`,
          `docker push --all-tags ${params.account}.dkr.ecr.${consts.ECR_REGION}.amazonaws.com/${params.repositoryName}`,
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

interface deployJobParams {
  vpc: IVpc  
  branch: string
  environment: string
  repositoryName: string
  account: string
  replicas: string
  clusterName: string
  inputArtifact: Artifact
  extraInputs: Artifact[]
  outputs?: Artifact[]
}

export const createMavenDeployAction = (scope: Construct, params: deployJobParams): CodeBuildAction => {
  const buildAction = new CodeBuildAction({
    actionName: 'K8s_Deploy',
    input: params.inputArtifact,
    extraInputs: params.extraInputs,
    outputs: params.outputs,
    project: createMavenDeployBuildProject(scope, params),
  });

  return buildAction;
};

const createMavenDeployBuildProject = (scope: Construct, params: deployJobParams): PipelineProject => {
  const projectName = `${params.repositoryName}-${params.branch}-deploy-${params.environment}`;
  const stageName = `${toValidConstructName(params.repositoryName)}Deploy${params.environment}CodeBuildProject`;

  const buildProject = new PipelineProject(scope, stageName, {
    projectName: projectName,
    vpc: params.vpc,
    buildSpec: buildMavenDeployBuildSpec(params),
    environment: consts.DEFAULT_CODE_BUILD_ENVIRONMENT,
    subnetSelection: {
      onePerAz: true,
    },
  });

  const buckerId = `momentum-money-k8s-templates-${params.repositoryName}-${params.environment}`;
  const k8sBucket = aws_s3.Bucket.fromBucketArn(
    scope,
    buckerId,
    `arn:aws:s3:::${consts.K8S_TEMPLATES_BUCKET_NAME}`
  );

  k8sBucket.grantReadWrite(buildProject);

  return buildProject;
}

const buildMavenDeployBuildSpec = (params: deployJobParams): BuildSpec => {
  const snapshotAppend = params.environment.toLowerCase() === consts.ENVIRONMENT_DEV;
  const appSelector = params.repositoryName;
  const instanceSelector = params.repositoryName;

  const buildSpec = BuildSpec.fromObject({
    version: consts.CODE_BUILD_SPEC_VERSION,
    phases: {
      install: {
        commands: [
          ...CommonCommands.installKubectl(),
          ...CommonCommands.installYq(),
        ]
      },
      build: {
        commands: [
          "SERVICE=$(git tag -l |sed 1q  |ggrep -o '.*-' |sed 's/.$//')",
          "VERSION=$(git tag -l |sed 1q  |rev |cut -d '-' -f 1 |rev)",
          'export VERSION=$(cat $CODEBUILD_SRC_DIR_Artifact_Build_Docker_Build/VERSION)',
          'echo resolved version $VERSION',
          'mkdir -p .k8s',
          `aws s3 sync s3://${consts.K8S_TEMPLATES_BUCKET_NAME} .k8s/`,
          `aws eks update-kubeconfig --name ${params.clusterName} --region af-south-1 --role-arn arn:aws:iam::${params.account}:role/eks-deploy`,
          // Create K8s deployment manifest file
          `bin/yq e -i \' \
            .metadata.name = "${params.repositoryName}" | \
            .metadata.labels.project = "${params.repositoryName}" | \
            .metadata.labels.app = "${params.repositoryName}" | \
            .spec.replicas = ${params.replicas} | \
            .spec.selector.matchLabels["app.kubernetes.io/instance"] = "${params.repositoryName}" | \
            .spec.template.metadata.labels["app.kubernetes.io/name"] = "${params.repositoryName}" | \
            .spec.template.metadata.labels["app.kubernetes.io/instance"] = "${params.repositoryName}" | \
            .spec.template.metadata.labels["app.kubernetes.io/version"] = strenv(VERSION)${snapshotAppend ? '+\"-SNAPSHOT\"' : ''} | \
            .spec.template.spec.containers[0].name = "${params.repositoryName}" | \
            .spec.template.spec.containers[0].env.[0].value = "${params.environment}" | \
            .spec.template.spec.containers[0].readinessProbe.httpGet.path = "/${params.repositoryName}" | \
            .spec.template.spec.containers[0].livenessProbe.httpGet.path = "/${params.repositoryName}" | \
            .spec.template.spec.containers[0].image = "${params.account}.dkr.ecr.${consts.ECR_REGION}.amazonaws.com/${params.repositoryName}:"+strenv(VERSION)${snapshotAppend ? '+\"-SNAPSHOT\"' : ''} \
            \' .k8s/deployment.yml`,
            // Create K8s service manifest files (headless)
            `bin/yq e -i \' \
            .metadata.name = "${params.repositoryName}-service-hl" | \
            .metadata.labels.project = "${params.repositoryName}" | \
            .metadata.labels.app = "${params.repositoryName}" | \
            .metadata.labels.["target-deployment"] = "${params.repositoryName}" | \
            .spec.selector["app.kubernetes.io/instance"] = "${params.repositoryName}" \
            \' .k8s/svc-headless.yml`,
            // Create K8s service manifest files
            `bin/yq e -i \' \
            .metadata.name = "${params.repositoryName}-service" | \
            .metadata.labels.project = "${params.repositoryName}" | \
            .metadata.labels.app = "${params.repositoryName}" | \
            .metadata.labels.["target-deployment"] = "${params.repositoryName}" | \
            .spec.selector["app.kubernetes.io/instance"] = "${params.repositoryName}" \
            \' .k8s/svc.yml`,
            `kubectl apply --namespace=${params.environment} -f .k8s/`,
        ]
      }
    },
    cache: {
      paths: ['/root/.m2/**/*'],
    },
    artifacts: {
      files: [
        '.k8s/*',
      ],
    },
  });

  return buildSpec;
};

interface releaseParams {
  branch: string
  region: string
  account: string
  repositoryName: string
  githubOrgName: string
  pomFilePath: string
  inputArtifact: Artifact
  extraInputs?: Artifact[],
  environment: string,
}

const createMavenReleaseProject = (scope: Construct, params: releaseParams): PipelineProject => {
  const projectName = `${params.repositoryName}-${params.branch}-release`;
  const role = MoneyRoleBuilder.buildCodeBuildReleaseRole(
    scope,
    params.environment,
    params.repositoryName,
    params.account,
    params.region
  );

  const stageName = `${toValidConstructName(params.repositoryName)}MavenReleaseCodeBuildProject`;
  const buildProject = new PipelineProject(scope, stageName, {
    role,
    projectName,
    environment: consts.DEFAULT_CODE_BUILD_ENVIRONMENT,
    subnetSelection: {
      onePerAz: true,
    },
    buildSpec: BuildSpec.fromObject({
      version: consts.CODE_BUILD_SPEC_VERSION,
      env: {
        'secrets-manager': {
          GITHUB_AUTH_TOKEN: consts.GITHUB_TOKEN_SECRET_NAME
        }
      },
      phases: {
        install: {
          commands: [
            ... CommonCommands.installYq()
          ]
        },
        build: {
          commands: [
            // 'env',
            // 'ls -al',
            // `git clone https://$GITHUB_AUTH_TOKEN@github.com/${params.githubOrgName}/${params.repositoryName}.git .repo`,
            // 'cd .repo',
            // 'git fetch --tags',
            // `git checkout ${params.branch}`,
            // `git reset --hard "$CODEBUILD_RESOLVED_SOURCE_VERSION"`,
            // 'cd ..',
            // 'mv .repo/.git .',
            // 'rm -rf .repo',
            // 'git status',
            // 'export VERSION=$(cat $CODEBUILD_SRC_DIR_Artifact_Build_Docker_Build/VERSION)',
            // 'export export LIVE_DATE_TAG=go-live-$(date --iso-8601=date)',
            // 'echo resolved version $VERSION',
            // `mvn -f ${params.pomFilePath} build-helper:parse-version versions:set -DnewVersion=$VERSION versions:commit`,
            // 'git status',
            // 'git config user.email \"cesadmins@mmiholdings.co.za\"',
            // 'git config user.name \"multiply-service\"',
            // 'git add *pom.xml **/pom.xml',
            // `git commit -m "Version update for Release v$VERSION"`,
            // `git tag -a "$VERSION" -m "Publish tag for version v$VERSION"`,
            // `git tag -a "$LIVE_DATE_TAG" -m "Publish tag for production deployment tracking $LIVE_DATE_TAG"`,
            // `git push https://$GITHUB_AUTH_TOKEN@github.com/${params.githubOrgName}/${params.repositoryName}.git --all`,
            // `git push https://$GITHUB_AUTH_TOKEN@github.com/${params.githubOrgName}/${params.repositoryName}.git --tags`,
            // `aws ecr get-login-password --region ${consts.ECR_REGION} | docker login --username AWS --password-stdin ${params.account}.dkr.ecr.${consts.ECR_REGION}.amazonaws.com`,
            // `docker pull ${params.account}.dkr.ecr.${consts.ECR_REGION}.amazonaws.com/${params.repositoryName}:$VERSION-SNAPSHOT`,
            // `docker tag ${params.account}.dkr.ecr.${consts.ECR_REGION}.amazonaws.com/${params.repositoryName}:$VERSION`,
            // `docker push ${params.account}.dkr.ecr.${consts.ECR_REGION}.amazonaws.com/${params.repositoryName}:$VERSION`,
          ]
        },
        post_build: {
          commands: [
          ]
        }
      },
    })
  });

  return buildProject;
}

export const createMavenRelease = (scope: Construct, params: releaseParams): CodeBuildAction => {
  const buildAction = new CodeBuildAction({
    actionName: 'Version_Publish',
    input: params.inputArtifact,
    extraInputs: params.extraInputs,
    project: createMavenReleaseProject(scope, params),
  });

  return buildAction;
};
