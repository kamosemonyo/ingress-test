#!/usr/bin/env node
import 'source-map-support/register';
import { App } from 'aws-cdk-lib';

import { ServiceBuilder } from '../misc/service-builder';
import { MavenPipelineStack } from '../pipeline/maven-pipeline';
import { Account } from '../lib/account';
import { ContainerStack } from '../container_registry/container';

const app = new App();
const env = app.node.tryGetContext('env')
const services = ServiceBuilder.buildServices(env);

new ContainerStack(app, 'money-management-container-registry', {
  services: services,
  env: Account.forPipeline(env)
})

for (const javaService of services) {
  new MavenPipelineStack(app, `${javaService.name}-maven-pipeline`, {
    repositoryName: javaService.name,
    serviceName: javaService.name,
    propertiesFile: javaService.propertiesFile,
    replicas: javaService.replicas,
    env: Account.forPipeline(env),
  });
}

app.synth();