import { Construct } from 'constructs';
import { SecretValue } from 'aws-cdk-lib';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Repository } from 'aws-cdk-lib/aws-codecommit';
import { Action, Artifact } from 'aws-cdk-lib/aws-codepipeline';
import {
  CodeCommitSourceAction,
  GitHubSourceAction,
  S3SourceAction,
} from 'aws-cdk-lib/aws-codepipeline-actions';

import { GITHUB_TOKEN_SECRET_NAME } from '../lib/constants';

const s3Source: string = 's3';
const codeCommitSource: string = 'codecommit';
const githubSource: string = 'github';

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
        oauthToken: SecretValue.secretsManager(GITHUB_TOKEN_SECRET_NAME),
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
