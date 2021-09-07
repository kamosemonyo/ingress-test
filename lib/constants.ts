import { LinuxBuildImage } from '@aws-cdk/aws-codebuild';

export const codeBuildSpecVersion = '0.2';
export const defaultCodeBuildEnvironment = { buildImage: LinuxBuildImage.STANDARD_5_0 };