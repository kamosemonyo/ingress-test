import { Construct } from 'constructs';
import { RemovalPolicy, Stack, StackProps, Tag } from 'aws-cdk-lib';
import { aws_ecr as ecr } from 'aws-cdk-lib';
import { toValidConstructName } from '../lib/util';
import { MoneyTags } from '../tags/tags';

interface parameters {
  repositoryName: string,
  serviceName: string
};

export const createEcrRepository = (scope: Construct, props: parameters): ecr.Repository => {
  const repository = new ecr.Repository(scope, `${toValidConstructName(props.repositoryName)}EcrRepository`, {
    imageScanOnPush: false,
    repositoryName: props.repositoryName,
    imageTagMutability: ecr.TagMutability.IMMUTABLE,
    removalPolicy: RemovalPolicy.DESTROY, // TODO disable after testing
  });

  repository._enableCrossEnvironment();

  repository.addLifecycleRule({ tagPrefixList: ['SNAPSHOT'], maxImageCount: 40 });
  repository.addLifecycleRule({ maxImageCount: 9999 });

  return repository;
};
