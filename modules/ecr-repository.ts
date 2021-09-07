import { Repository, TagMutability } from '@aws-cdk/aws-ecr';
import { Construct, Environment, Stack, StackProps } from '@aws-cdk/core';
import { toValidConstructName } from '../lib/util';

interface parameters {
  repositoryName: string
  env: Environment
};

export const createEcrRepository = (scope: Construct, params: parameters): Repository => {
  return new EcrRepositoryStack(scope, `${toValidConstructName(params.repositoryName)}Ecr`, {
    repositoryName: params.repositoryName,
    env: params.env,
  }).repository;
};

interface stackProps extends StackProps {
  repositoryName: string
}

class EcrRepositoryStack extends Stack {
  repository: Repository;

  constructor(scope: Construct, id: string, props: stackProps) {
    super(scope, id, props);

    this.repository = new Repository(scope, `${toValidConstructName(props.repositoryName)}EcrRepository`, {
      repositoryName: props.repositoryName,
      imageTagMutability: TagMutability.IMMUTABLE,
      imageScanOnPush: true,
    });
  
    // this.repository._enableCrossEnvironment();
  
    this.repository.addLifecycleRule({ tagPrefixList: ['SNAPSHOT'], maxImageCount: 40 });
    this.repository.addLifecycleRule({ maxImageCount: 9999 });

    this.exportValue(this.repository.repositoryName, { name: `${props.repositoryName}-ecr-repository` });
    this.exportValue(this.repository.repositoryArn, { name: `${props.repositoryName}-ecr-repository-arn` });
    this.exportValue(this.repository.repositoryUri, { name: `${props.repositoryName}-ecr-repository-uri` });
  }
};
