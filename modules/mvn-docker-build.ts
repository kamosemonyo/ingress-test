import { Construct } from 'constructs';
import { IVpc } from 'aws-cdk-lib/aws-ec2';
import { Effect, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { CodeBuildAction } from "aws-cdk-lib/aws-codepipeline-actions";
import { BuildSpec, PipelineProject } from 'aws-cdk-lib/aws-codebuild';
import { Artifact } from 'aws-cdk-lib/aws-codepipeline';

import { toValidConstructName } from '../lib/util';
import { CommonCommands } from '../lib/commands';

import * as consts from '../lib/constants';

interface parameters {
  vpc: IVpc
  branch: string
  repositoryName: string
  propertiesFilePath: string
  pomFilePath: string
  account: string
  region: string
  inputArtifact: Artifact
  outputArtifact: Artifact
};

export const createMavenDockerBuildAction = (scope: Construct, params: parameters): CodeBuildAction => {
  const buildAction = new CodeBuildAction({
    actionName: 'Docker_Build',
    input: params.inputArtifact,
    outputs: [params.outputArtifact],
    project: createMavenDockerBuildProject(scope, params),
  });

  return buildAction;
};

const createMavenDockerBuildProject = (scope: Construct, params: parameters): PipelineProject => {
  const projectName = `${params.repositoryName}-${params.branch}-build`;

  const role = new Role(scope, `${params.repositoryName}MavenDockerBuildRole`, {
    assumedBy: new ServicePrincipal('codebuild.amazonaws.com'),
  });

  role.addToPrincipalPolicy(new PolicyStatement({
    effect: Effect.ALLOW,
    actions: [
      'ecr:BatchGetImage',
      'ecr:BatchCheckLayerAvailability',
      "ecr:CompleteLayerUpload",
      "ecr:InitiateLayerUpload",
      'ecr:GetDownloadUrlForLayer',
      "ecr:PutImage",
      "ecr:UploadLayerPart"
    ],
    resources: [
      `arn:aws:ecr:${consts.ECR_REGION}:${params.account}:repository/${params.repositoryName}`
    ]
  }));

  role.addToPrincipalPolicy(new PolicyStatement({
    effect: Effect.ALLOW,
    actions: [
      'ecr:GetAuthorizationToken',
    ],
    resources: ['*']
  }));

  role.addToPrincipalPolicy(new PolicyStatement({
    effect: Effect.ALLOW,
    actions: [
      'kms:Decrypt',
      'ssm:GetParameter',
      'ssm:GetParameters',
      'ssm:GetParametersByPath',
      'ssm:GetParameterHistory'
    ],
    resources: [
      `arn:aws:ssm:${params.region ?? '*'}:${params.account ?? '*'}:parameter${consts.NEXUS_USERNAME_SSM_KEY}`,
      `arn:aws:ssm:${params.region ?? '*'}:${params.account ?? '*'}:parameter${consts.NEXUS_PASSWORD_SSM_KEY}`,
      `arn:aws:kms:${params.region ?? '*'}:${params.account ?? '*'}:key/*`,
    ]
  }));

  const buildProject = new PipelineProject(scope, `${toValidConstructName(params.repositoryName)}MavenDockerCodeBuildProject`, {
    role,
    projectName,
    buildSpec: buildMavenDockerBuildSpec(params),
    environment: consts.defaultCodeBuildEnvironment,
    vpc: params.vpc,
    subnetSelection: {
      onePerAz: true,
    },
  });
  
  return buildProject;
}

const buildMavenDockerBuildSpec = (params: parameters): BuildSpec => {
  const buildSpec = BuildSpec.fromObject({
    version: consts.codeBuildSpecVersion,
    phases: {
      install: {
        'runtime-versions': {
          java: 'openjdk8',
          docker: 18,
        },
      },
      build: {
        commands: [
          'java -version',
          'mvn -version',
          // Create ~/.m2/settings.xml file
          ...CommonCommands.setupMvnSettings(params.region),
          // Get and store current version for Rollback
          `export ROLLBACK_VERSION=$(mvn org.apache.maven.plugins:maven-help-plugin:2.1.1:evaluate -Dexpression=project.version | sed -n -e '/^\\[.*\\]/ !{ /^[0-9]/ { p; q } }')`,
          `echo "Resolved current version $ROLLBACK_VERSION"`,
          'echo $ROLLBACK_VERSION > ROLLBACK_VERSION',
          // Calculate next release version
          `mvn -f ${params.pomFilePath} build-helper:parse-version versions:set -DnewVersion='\${parsedVersion.majorVersion}.\${parsedVersion.nextMinorVersion}.'0 versions:commit`,
          // Maven build
          'mvn clean install',
          `export VERSION=\`grep -oP \'version=\\K.*\' ${params.propertiesFilePath}\``,
          `echo "Resolved new version $VERSION"`,
          'echo $VERSION > VERSION',
          `cp ${params.propertiesFilePath} docker/files`,
          // Deploy Maven artifacts for version
          'mvn deploy',
          // Build and push docker image for version snapshot
          `aws ecr get-login-password --region ${consts.ECR_REGION} | docker login --username AWS --password-stdin ${params.account}.dkr.ecr.${consts.ECR_REGION}.amazonaws.com`,
          `docker build -t ${params.account}.dkr.ecr.${consts.ECR_REGION}.amazonaws.com/${params.repositoryName}:$VERSION-SNAPSHOT .`,
          `docker push ${params.account}.dkr.ecr.${consts.ECR_REGION}.amazonaws.com/${params.repositoryName}:$VERSION-SNAPSHOT`,
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
  const EKS_DEPLOY_ROLE_ARN = `arn:aws:iam::${params.account}:role/eks-deploy`;

  // Role should be created with EKS cluster and mapped to admin group
  const role =  Role.fromRoleArn(scope, `${params.environment.toUpperCase()}${toValidConstructName(params.repositoryName)}EksDeployRole`, EKS_DEPLOY_ROLE_ARN);

  role.addToPrincipalPolicy(new PolicyStatement({
    effect: Effect.ALLOW,
    actions: [
      'sts:AssumeRole',
    ],
    resources: [EKS_DEPLOY_ROLE_ARN]
  }));

  role.addToPrincipalPolicy(new PolicyStatement({
    effect: Effect.ALLOW,
    actions: [
      'eks:DescribeCluster',
    ],
    resources: ['*']
  }));

  const buildProject = new PipelineProject(scope, `${toValidConstructName(params.repositoryName)}Deploy${params.environment}CodeBuildProject`, {
    role,
    projectName,
    vpc: params.vpc,
    buildSpec: buildMavenDeployBuildSpec(params),
    environment: consts.defaultCodeBuildEnvironment,
    subnetSelection: {
      onePerAz: true,
    },
  });
  
  return buildProject;
}

const buildMavenDeployBuildSpec = (params: deployJobParams): BuildSpec => {
  const snapshotAppend = params.environment.toLowerCase() === consts.ENVIRONMENT_DEV;

  const buildSpec = BuildSpec.fromObject({
    version: consts.codeBuildSpecVersion,
    // env: {
    //   'secrets-manager': {
    //     GITHUB_AUTH_TOKEN: consts.GITHUB_TOKEN_SECRET_NAME
    //   }
    // },
    phases: {
      install: {
        commands: [
          ...CommonCommands.installKubectl(),
          ...CommonCommands.installYq(),
        ]
      },
      build: {
        commands: [
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
  extraInputs?: Artifact[]
}

const createMavenReleaseProject = (scope: Construct, params: releaseParams): PipelineProject => {
  const projectName = `${params.repositoryName}-${params.branch}-release`;

  const role = new Role(scope, `${toValidConstructName(params.repositoryName)}MavenReleaseCodeBuildProjectRole`, {
    roleName: projectName,
    assumedBy: new ServicePrincipal('codebuild.amazonaws.com'),
  });

  role.addToPrincipalPolicy(new PolicyStatement({
    effect: Effect.ALLOW,
    actions: [
      'ecr:GetAuthorizationToken',
      'secretsmanager:ListSecrets',
    ],
    resources: ['*']
  }));

  role.addToPrincipalPolicy(new PolicyStatement({
    effect: Effect.ALLOW,
    actions: [
      'secretsmanager:GetResourcePolicy',
      'secretsmanager:GetSecretValue',
      'secretsmanager:DescribeSecret',
      'secretsmanager:ListSecretVersionIds',
      ],
    resources: [
      `arn:aws:secretsmanager:${params.region ?? '*'}:${params.account ?? '*'}:secret:${consts.GITHUB_TOKEN_SECRET_NAME}-*`,
    ]
  }));

  role.addToPrincipalPolicy(new PolicyStatement({
    effect: Effect.ALLOW,
    actions: [
      'ecr:BatchGetImage',
      'ecr:BatchCheckLayerAvailability',
      "ecr:CompleteLayerUpload",
      "ecr:InitiateLayerUpload",
      'ecr:GetDownloadUrlForLayer',
      "ecr:PutImage",
      "ecr:UploadLayerPart"
    ],
    resources: [
      `arn:aws:ecr:${consts.ECR_REGION}:${params.account}:repository/${params.repositoryName}`
    ]
  }));

  const buildProject = new PipelineProject(scope, `${toValidConstructName(params.repositoryName)}MavenReleaseCodeBuildProject`, {
    role,
    projectName,
    // buildSpec: buildMavenDockerBuildSpec(params),
    environment: consts.defaultCodeBuildEnvironment,
    // vpc: Vpc.fromLookup(scope, 'CodeBuildVpc', {
    //   vpcName: consts.CODE_BUILD_VPC_NAME,
    //   isDefault: false,
    // }),
    subnetSelection: {
      onePerAz: true,
    },
    buildSpec: BuildSpec.fromObject({
      version: consts.codeBuildSpecVersion,
      env: {
        'secrets-manager': {
          GITHUB_AUTH_TOKEN: consts.GITHUB_TOKEN_SECRET_NAME
        }
      },
      phases: {
        install: {
          // commands: [
          //   ...CommonCommands.installGithubCLI(),
          // ]
        },
        build: {
          commands: [
            'env',
            'ls -al',
            `git clone https://$GITHUB_AUTH_TOKEN@github.com/${params.githubOrgName}/${params.repositoryName}.git .repo`,
            'cd .repo',
            'git fetch --tags',
            `git checkout ${params.branch}`,
            `git reset --hard "$CODEBUILD_RESOLVED_SOURCE_VERSION"`,
            'cd ..',
            'mv .repo/.git .',
            'rm -rf .repo',
            'git status',
            'export VERSION=$(cat $CODEBUILD_SRC_DIR_Artifact_Build_Docker_Build/VERSION)',
            'echo resolved version $VERSION',
            `mvn -f ${params.pomFilePath} build-helper:parse-version versions:set -DnewVersion=$VERSION versions:commit`,
            'git status',
            'git config user.email \"cesadmins@mmiholdings.co.za\"',
            'git config user.name \"multiply-service\"',
            'git add *pom.xml **/pom.xml',
            `git commit -m "Version update for Release v$VERSION"`,
            `git tag -a "$VERSION" -m "Publish tag for version v$VERSION"`,
            `git push https://$GITHUB_AUTH_TOKEN@github.com/${params.githubOrgName}/${params.repositoryName}.git --all`,
            `git push https://$GITHUB_AUTH_TOKEN@github.com/${params.githubOrgName}/${params.repositoryName}.git --tags`,
            `aws ecr get-login-password --region ${consts.ECR_REGION} | docker login --username AWS --password-stdin ${params.account}.dkr.ecr.${consts.ECR_REGION}.amazonaws.com`,
            `docker pull ${params.account}.dkr.ecr.${consts.ECR_REGION}.amazonaws.com/${params.repositoryName}:$VERSION-SNAPSHOT`,
            `docker tag ${params.account}.dkr.ecr.${consts.ECR_REGION}.amazonaws.com/${params.repositoryName}:$VERSION-SNAPSHOT ${params.account}.dkr.ecr.${consts.ECR_REGION}.amazonaws.com/${params.repositoryName}:$VERSION`,
            `docker push ${params.account}.dkr.ecr.${consts.ECR_REGION}.amazonaws.com/${params.repositoryName}:$VERSION`,
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
