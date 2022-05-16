import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { Service } from "../misc/service";
import { createEcrRepository } from "../pipeline_stage/ecr-repository";

export interface ContainerStackProps extends StackProps {
   services: Service[]
}

export class ContainerStack extends Stack {
  constructor(scope: Construct, id: string, props: ContainerStackProps) {
    super(scope, id, props);

    for (const service of props.services) {
      const ecrRepository = createEcrRepository(this, { repositoryName: service.name, serviceName: service.name });

      this.exportValue(ecrRepository.repositoryName, { name: `${service.name}-ecr-repository` });
      this.exportValue(ecrRepository.repositoryArn, { name: `${service.name}-ecr-repository-arn` });
      this.exportValue(ecrRepository.repositoryUri, { name: `${service.name}-ecr-repository-uri` });
    }

  }
}