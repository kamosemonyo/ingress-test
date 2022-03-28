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
  new MavenServicePipeline(app, `${javaService.name}-maven-pipeline`, {
    repositoryName: javaService.name,
    propertiesFile: javaService.propertiesFile,
    replicas: javaService.replicas,
    env: Account.forPipeline(env),
  });
}

// class KubectlStack extends Stack {
//   constructor(scope:Construct, id:string, props:StackProps) {
//     super(scope, id, props)
//     const eksRole = aws_iam.Role.fromRoleArn(this, 'test-role', 'arn:aws:iam::737245153745:role/eks-deploy');
    
//     const pipelineRole = new aws_iam.Role(
//       this,
//       'pipeline-test-role',
//       { 
//         roleName: 'pipeline-test-role',
//         assumedBy: new ArnPrincipal('')
//       }
//     );

//     eksRole.grant(pipelineRole, 'sts:Assume');

//     pipelineRole.addToPrincipalPolicy(new PolicyStatement({
//       effect: Effect.ALLOW,
//       actions: [eksRole.assumeRoleAction],
//       resources: [eksRole.roleArn]
//     }));

//     console.log(eksRole)
//   }
// }

// new KubectlStack(app, 'kube-test', {
//   env: Account.forCluster(env)
// })

app.synth();