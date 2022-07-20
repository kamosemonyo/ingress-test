import { StackProps } from "aws-cdk-lib";

export interface ServicePipelineProps extends StackProps {
  repositoryName:string,
  serviceName: string,
  propertiesFile:string,
  replicas: Number,
  host?:string
}