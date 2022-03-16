#!/usr/bin/env node
import 'source-map-support/register';
import { App } from 'aws-cdk-lib';

import { ServiceBuilder } from '../misc/service-builder';
import { MavenServicePipeline } from '../templates/maven-service-pipeline';
import { Account } from '../lib/account';

const app = new App();
const env = app.node.tryGetContext('env')
const javaServices = ServiceBuilder.buildJavaServices(env);

for (const javaService of javaServices) {
  new MavenServicePipeline(app, `${javaService.name}MavenPipeline`, {
    repositoryName: javaService.name,
    propertiesFile: javaService.propertiesFile,
    replicas: javaService.replicas,
    env: Account.from(env)
  });
}

app.synth();