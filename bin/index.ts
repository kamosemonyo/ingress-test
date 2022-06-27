#!/usr/bin/env node
import 'source-map-support/register';
import { App } from 'aws-cdk-lib';
import { ServiceBuilder } from '../service/service-builder';
import { ContainerBuilder, } from '../container_registry/container';
import { PipelineBuilder } from '../pipeline/pipeline-stack';
import { K8sTemplatesS3Bucket } from '../deployment_templates/k8s-templates';
import { AWS_NON_PROD_ACCOUNT } from '../deployment_templates/constants';
import { PIPELINE_REGION } from '../lib/constants';

const app = new App();
const env = app.node.tryGetContext('env')
const services = ServiceBuilder.buildServices(env);

ContainerBuilder.buildContainers(app, services, env);
PipelineBuilder.buildPipelines(app, services, env);

new K8sTemplatesS3Bucket(app, 'MoneyEksBuckets', {
  env: {
    account: AWS_NON_PROD_ACCOUNT,
    region: PIPELINE_REGION
  }
});

app.synth();