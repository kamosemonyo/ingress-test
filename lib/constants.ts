import { BuildEnvironment, ComputeType, LinuxBuildImage } from 'aws-cdk-lib/aws-codebuild';

export const ECR_REGION = 'eu-west-1';
export const validEnvironmentNames = ['dev', 'preprod', 'prod'];
export const multiplyMoneyK8sSecret = 'momentum-money-secrets';
export const mainGitBranch = 'master';
export const codeBuildSpecVersion = '0.2';
export const nexusRepository = 'http://nexus-ces.mmih.biz';

export const defaultCodeBuildEnvironment:BuildEnvironment = {
    buildImage: LinuxBuildImage.STANDARD_3_0,
    computeType: ComputeType.MEDIUM,
    privileged: true 
};

export const NEXUS_USERNAME_SSM_KEY = '/mmi/nexus/username';
export const NEXUS_PASSWORD_SSM_KEY = '/mmi/nexus/password';

export const K8S_TEMPLATES_BUCKET_NAME = 'momentum-money-k8s-templates';
export const CODE_BUILD_VPC_NAME = 'mmtnonprdVPC';
export const GITHUB_TOKEN_SECRET_NAME = 'github-mmi-holdings-ces-token';
export const GITHUB_HOST = 'github.com';

export const CODE_BUILD_BUILD_ROLE = 'code-build-money-build-role';
export const CODE_BUILD_RELEASE_ROLE = 'code-build-money-release-role';
export const EKS_DEPLOY_ROLE = 'eks-money-deploy-role';

export const EKS_NON_PROD_CLUSTER_NAME = 'non-prod';

export const ENVIRONMENT_DEV = 'dev';

export const ENV_PRE = 'pre'
export const ENV_PROD = 'prod'
export const ENV_DEV = 'dev'
