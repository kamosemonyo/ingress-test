import { SecretValue, Stack, StackProps } from "aws-cdk-lib";
import { BuildSpec, Project } from "aws-cdk-lib/aws-codebuild";
import { Artifact, Pipeline } from "aws-cdk-lib/aws-codepipeline";
import { CodeBuildAction, GitHubSourceAction } from "aws-cdk-lib/aws-codepipeline-actions";
import { Subnet, SubnetType, Vpc } from "aws-cdk-lib/aws-ec2";
import { Effect, PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Service } from "cdk8s-plus-17";
import { Construct } from "constructs";
import { CommonCommands } from "../lib/commands";
import { ACCOUNT_PRE, CODE_BUILD_SPEC_VERSION, CODE_BUILD_VPC_NAME } from "../lib/constants";
import { MoneyTags } from "../tags/tags";

export class IngressTestStack extends Stack {
  constructor(scope:Construct, id:string = 'IngressTestStack', props:StackProps) {
    super(scope, id, props);

    const pipeline = new Pipeline(this, 'ingress-test-pipeline', {
      restartExecutionOnUpdate: true
    })

    pipeline.role.addToPrincipalPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [pipeline.role.assumeRoleAction],
      resources: ['*']
    }))

    const sourceArtifact = new Artifact()

    pipeline.addStage({
      stageName: 'Source',
      actions: [
        new GitHubSourceAction({
          actionName: 'Source',
          oauthToken: SecretValue.plainText('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'),
          repo: 'test-ingress',
          owner: 'kamosemonyo',
          output: sourceArtifact
        })
      ]
    })

    const vpc = Vpc.fromLookup(this, 'eks-vpc', {
      vpcName: CODE_BUILD_VPC_NAME,
      isDefault: false,
    })

    const role = new Role(this, 'mm-eks-test-ingress', {
      roleName: 'mm-eks-test-ingress',
      assumedBy: new ServicePrincipal('codebuild.amazonaws.com'),
    })

    role.addToPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['iam:PassRole'],
      resources: ['arn:aws:iam::737245153745:role/eks-deploy']
    }))

    role.addToPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'eks:DescribeCluster',
        'eks:ListClusters'
      ],
      resources: ['*']
    }))

    const buildProject = new Project(this, 'ingress-deploy-project', {
        vpc: vpc,
        role: role,
        subnetSelection: {
            subnetType: SubnetType.PRIVATE_ISOLATED,
            onePerAz: true
        },
        buildSpec: BuildSpec.fromObject({
            version: CODE_BUILD_SPEC_VERSION,
            phases: {
                install: {
                  commands: [
                    ...CommonCommands.installKubectl(),
                    ...CommonCommands.installJq
                  ]
                },
                build: {
                  commands: [
                    'ls ',
                    ...CommonCommands.assumeAwsRole('arn:aws:iam::737245153745:role/eks-deploy'),
                    'aws eks update-kubeconfig --name non-prod --region af-south-1',
                    `kubectl apply -f ingress.yaml`
                  ]
                }
            }   
        })
    })

    buildProject.addToRolePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'iam:PassRole',
      ],
      resources: ['arn:aws:iam::737245153745:role/eks-deploy']
    }))

    const buildStage = new CodeBuildAction({
      actionName: 'EKS_Deploy',
      input: sourceArtifact,
      project: buildProject
    })

    MoneyTags.addPipelineTags(pipeline)
    MoneyTags.addPipelineTags(buildStage)
    MoneyTags.addPipelineTags(buildProject)

    pipeline.addStage({
      stageName: 'deploy',
      actions: [buildStage]
    })
  }
}