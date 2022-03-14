#!/usr/bin/env node
import 'source-map-support/register';
import { App } from 'aws-cdk-lib';

import { ServiceBuilder } from '../misc/service-builder';
import { MavenServicePipeline } from '../templates/maven-service-pipeline';

const app = new App();
const javaServices = ServiceBuilder.buildJavaServices();

for (const javaService of javaServices) {
  new MavenServicePipeline(app, `${javaService.name}MavenPipeline`, {
    repositoryName: javaService.name,
    env: {
      region: 'eu-west-1',
      account: '737245153745',
    }
  });
}

app.synth();