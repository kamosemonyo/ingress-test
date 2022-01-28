#!/usr/bin/env node
import 'source-map-support/register';
import { App } from 'aws-cdk-lib';

import { MavenServicePipeline } from '../templates/maven-service-pipeline';

const app = new App();

const template: string = app.node.tryGetContext('template');
const repositoryName: string = app.node.tryGetContext('repositoryName');

switch (template) {
  case 'maven-service-pipeline':
    new MavenServicePipeline(app, `${repositoryName}MavenPipeline`, {
      repositoryName,
      env: {
        region: 'eu-west-1',
        account: '737245153745',
      }
    });
    break;
  
  default:
    throw Error(`Expected a valid template context, got ${template}`);
}

app.synth();