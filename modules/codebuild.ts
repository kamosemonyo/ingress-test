import { Construct } from '@aws-cdk/core';
import { CodeBuildAction } from "@aws-cdk/aws-codepipeline-actions";
import { BuildSpec, PipelineProject } from '@aws-cdk/aws-codebuild';
import { Artifact } from '@aws-cdk/aws-codepipeline';
import { toValidConstructName } from '../lib/util';

interface parameters {
  branch: string
  repositoryName: string
  buildSpecFilePath: string
  inputArtifact: Artifact
};

export const getCodeBuildAction = (scope: Construct, params: parameters): CodeBuildAction => {
  const buildAction = new CodeBuildAction({
    actionName: 'CodeBuild',
    input: params.inputArtifact,
    project: getCodeBuildProject(scope, params.repositoryName, params.branch, params.buildSpecFilePath),
  });

  return buildAction;
};


const getCodeBuildProject = (scope: Construct, repositoryName: string, branch: string, buildSpecFilePath: string): PipelineProject => {
  const buildProject = new PipelineProject(scope, `${toValidConstructName(repositoryName)}CodeBuildProject`, {
    projectName: `${repositoryName}-${branch}-build`,
    buildSpec: getCodeBuildSpec(buildSpecFilePath),
  });
  
  return buildProject;
}

const getCodeBuildSpec = (buildSpecFilePath: string): BuildSpec => {
  return BuildSpec.fromSourceFilename(buildSpecFilePath)
}