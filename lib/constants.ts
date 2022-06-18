import { BuildEnvironment, ComputeType, LinuxBuildImage } from 'aws-cdk-lib/aws-codebuild';

export const ECR_REGION:string = 'eu-west-1';
export const EKS_REGION:string = 'af-south-1';
export const PIPELINE_REGION:string = 'eu-west-1';

export const ACCOUNT_PRE:string = '737245153745'
export const ACCOUNT_PROD:string = '081138765061'

export const VALID_ENVIRONMENTS = ['dev', 'preprod', 'prod'];
export const MONEY_K8S_SECRETS = 'momentum-money-secrets';
export const MAIN_GIT_BRANCH = 'migrate';
export const CODE_BUILD_SPEC_VERSION = '0.2';
export const NEXUS_REPOSITORY = 'http://nexus-ces.mmih.biz';

export const DEFAULT_CODE_BUILD_ENVIRONMENT:BuildEnvironment = {
    buildImage: LinuxBuildImage.STANDARD_5_0,
    computeType: ComputeType.MEDIUM,
    privileged: true
};

export const NEXUS_USERNAME_SSM_KEY:string = '/mmi/nexus/username';
export const NEXUS_PASSWORD_SSM_KEY:string = '/mmi/nexus/password';

export const K8S_TEMPLATES_BUCKET_NAME:string = 'momentum-money-k8s-templates';
export const INGRESS_TEMPLATES_BUCKET_NAME:string = 'momentum-money-k8s-ingress-templates';
export const CODE_BUILD_VPC_NAME:string = 'mmtnonprdVPC';
export const GITHUB_TOKEN_SECRET_NAME:string = 'github-mmi-holdings-ces-token';
export const GITHUB_HOST:string = 'github.com';
export const GITHUB_ORG:string = 'mmi-holdings-ces'

export const CODE_BUILD_BUILD_ROLE:string = 'code-build-money-build-role';
export const CODE_BUILD_RELEASE_ROLE:string = 'code-build-money-release-role';
export const EKS_DEPLOY_ROLE:string = 'arn:aws:iam::737245153745:role/eks-deploy';

export const EKS_NON_PROD_CLUSTER_NAME:string = 'non-prod';

export const ENVIRONMENT_DEV:string = 'dev';

export const ENV_PRE:string = 'preprod'
export const ENV_PROD:string = 'prod'
export const ENV_DEV:string = 'dev'

export const MAVEN_TEMPLATE:string = 'maven'
export const KONG_TEMPLATE:string = 'kong'
export const DOCKER_TEMPLATE:string = 'docker'

export const KONG_DEV_TAG:string = 'SNAPSHOT_VERSION'
export const KONG_PRE_TAG:string = 'PRE_VERSION'
export const KONG_PROD_TAG:string = 'PROD_VERSION'
