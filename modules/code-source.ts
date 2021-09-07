import { Bucket } from '@aws-cdk/aws-s3';
import { Repository } from '@aws-cdk/aws-codecommit';
import { Action, Artifact } from '@aws-cdk/aws-codepipeline';
import { Construct, SecretValue } from '@aws-cdk/core';
import {
  CodeCommitSourceAction,
  GitHubSourceAction,
  S3SourceAction,
} from '@aws-cdk/aws-codepipeline-actions';

const s3Source: string = 's3';
const codeCommitSource: string = 'codecommit';
const githubSource: string = 'github';

const githubTokenSecretName: string = 'github-mmi-holdings-ces-token';

interface parameters {
  githubOrg?: string
  repositoryName?: string
  sourceProvider?: string
  bucketKey?: string
  branch?: string
  bucketName?: string
  sourceArtifact: Artifact
}

export const getSourceAction = (scope: Construct, params: parameters): Action => {
  const output = params.sourceArtifact;

  switch(params.sourceProvider) {
    case codeCommitSource:
      validateCodeCommitSourceParams(params);
      return new CodeCommitSourceAction({
        output,
        actionName: 'CodeCommit_Source',
        branch: params.branch,
        repository: Repository.fromRepositoryName(scope, 'SourceRepository', params.repositoryName!),
      });

    case s3Source:
      validateS3SourceParams(params);
      return new S3SourceAction({
        output,
        actionName: 'S3_Source',
        bucketKey: params.bucketKey!,
        bucket: Bucket.fromBucketName(scope, 'SourceBucket', params.bucketName!),
      });
    
    default:
      validateGithubSourceParams(params);
      return new GitHubSourceAction({
        output,
        actionName: 'Github_Source',
        branch: params.branch,
        owner: params.githubOrg!,
        repo: params.repositoryName!,
        oauthToken: SecretValue.secretsManager(githubTokenSecretName),
      });
  }
};

const validateCodeCommitSourceParams = (params: parameters) => {
  if (params.repositoryName) {
    throw Error(`repositoryName parameter(s) are required when source is ${githubSource}`);
  }
}

const validateS3SourceParams = (params: parameters) => {
  if (!params.bucketKey || !params.bucketName) {
    throw Error(`bucketKey and bucketName parameter(s) are required when source is ${s3Source}`);
  }
}

const validateGithubSourceParams = (params: parameters) => {
  if (!params.githubOrg || !params.repositoryName) {
    throw Error(`githubOrg and repositoryName parameter(s) are required when source is ${githubSource}`);
  }
}
