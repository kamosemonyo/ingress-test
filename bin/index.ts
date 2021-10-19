#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';

import { MavenServicePipeline } from '../templates/maven-service-pipeline';

const app = new cdk.App();

const template: string = app.node.tryGetContext('template');
const repositoryName: string = app.node.tryGetContext('repositoryName');

switch (template) {
  case 'maven-service-pipeline':
    new MavenServicePipeline(app, `${repositoryName}MavenPipeline`, {

    });
    break;
  
  default:
    `Expected a valid template context, got ${template}`
}

app.synth();