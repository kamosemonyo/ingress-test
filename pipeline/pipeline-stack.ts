import { Construct } from "constructs";
import { Account } from "../lib/account";
import { KONG_TEMPLATE, MAVEN_TEMPLATE } from "../lib/constants";
import { Service } from "../misc/service";
import { KongPipelineStack } from "./kong-pipeline";
import { MavenPipelineStack } from "./maven-pipeline";


export class PipelineBuilder {
  static buildPipelines (scope: Construct ,services:Service[], env:any) {
    for (const service of services) {
      if (service.template == MAVEN_TEMPLATE) {
        new MavenPipelineStack(scope, `${service.name}-maven-pipeline`, {
          repositoryName: service.name,
          serviceName: service.name,
          propertiesFile: service.propertiesFile,
          replicas: service.replicas,
          env: Account.forPipeline(env),
        });
      } else if (service.template == KONG_TEMPLATE) {
        new KongPipelineStack(scope, `${service.name}-kong-pipeline`, {
          repositoryName: service.name,
          serviceName: service.name,
          propertiesFile: service.propertiesFile,
          replicas: service.replicas,
          host: service.host,
          env: Account.forPipeline(env),
        });
      }
    }
  }
}