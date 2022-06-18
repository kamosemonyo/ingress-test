import { Environment, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { Account } from "../lib/account";
import { Service } from "../misc/service";
import { createEcrRepository } from "../pipeline_stage/ecr-repository";
import { MoneyTags, MoneyTagType } from "../tags/tags";

export interface ContainerStackProps extends StackProps {
   services: Service[]
}

class ContainerStack extends Stack {
  constructor(scope: Construct, id: string, props: ContainerStackProps) {
    super(scope, id, props);

    for (const service of props.services) {
      const ecrRepository = createEcrRepository(this, { repositoryName: service.name, serviceName: service.name });

      this.exportValue(ecrRepository.repositoryName, { name: `${service.name}-ecr-repository` });
      this.exportValue(ecrRepository.repositoryArn, { name: `${service.name}-ecr-repository-arn` });
      this.exportValue(ecrRepository.repositoryUri, { name: `${service.name}-ecr-repository-uri` });

      MoneyTags.addTag(MoneyTagType.PIPELINE_RESOURCE, ecrRepository)
      MoneyTags.addTag(MoneyTagType.CONTAINER_RESOURCE, ecrRepository)
    }
  }
}

export class ContainerBuilder {
  static buildContainers (scope:Construct ,services:Service[], env:string) {
    new ContainerStack(scope, 'money-management-container-registry', {
      services: services,
      env: Account.forImages(env)
    });
  }
}