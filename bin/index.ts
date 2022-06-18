#!/usr/bin/env node
import 'source-map-support/register';
import { App } from 'aws-cdk-lib';
import { ServiceBuilder } from '../misc/service-builder';
import { ContainerBuilder, } from '../container_registry/container';
import { PipelineBuilder } from '../pipeline/pipeline-stack';

const app = new App();
const env = app.node.tryGetContext('env')
const services = ServiceBuilder.buildServices(env);

ContainerBuilder.buildContainers(app, services, env);
PipelineBuilder.buildPipelines(app, services, env);

app.synth();