import { LinuxBuildImage } from '@aws-cdk/aws-codebuild';

export const validEnvironmentNames = ['dev', 'pre', 'prod'];
export const multiplyMoneyK8sSecret = 'momentum-money-secrets';
export const mainGitBranch = 'master';
export const codeBuildSpecVersion = '0.2';
export const nexusRepository = 'http://nexus-ces.mmih.biz';
export const defaultCodeBuildEnvironment = { buildImage: LinuxBuildImage.STANDARD_5_0 };