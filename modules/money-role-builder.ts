import { CompositePrincipal, Effect, IRole, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { ECR_REGION, GITHUB_TOKEN_SECRET_NAME, NEXUS_PASSWORD_SSM_KEY, NEXUS_USERNAME_SSM_KEY } from '../lib/constants';

export class MoneyRoleBuilder {

    static buildCodeBuildRole (scope:Construct, eksEnv:string, repositoryName:string, account:string, region:string):IRole {
      const roleName = `money-eks-${repositoryName}-build-${eksEnv.toLocaleLowerCase()}`;
      const buildRole = new Role(scope, roleName, {
        roleName: roleName,
        assumedBy: new CompositePrincipal(
          new ServicePrincipal('codebuild.amazonaws.com'),
          new ServicePrincipal('codepipeline.amazonaws.com')
        )
      });
    
      buildRole.addToPrincipalPolicy(new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          'ecr:BatchGetImage',
          'ecr:BatchCheckLayerAvailability',
          'ecr:CompleteLayerUpload',
          'ecr:InitiateLayerUpload',
          'ecr:GetDownloadUrlForLayer',
          'ecr:PutImage',
          'ecr:UploadLayerPart'
        ],
        resources: [
          `arn:aws:ecr:${ECR_REGION}:${account}:repository/${repositoryName}`
        ]
      }));
    
      buildRole.addToPrincipalPolicy(new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          'codebuild:StartBuild',
          'ecr:GetAuthorizationToken'
        ],
        resources: ['*']
      }));
    
      buildRole.addToPrincipalPolicy(new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          'kms:Decrypt',
          'ssm:GetParameter',
          'ssm:GetParameters',
          'ssm:GetParametersByPath',
          'ssm:GetParameterHistory'
        ],
        resources: [
          `arn:aws:ssm:${region ?? '*'}:${account ?? '*'}:parameter${NEXUS_USERNAME_SSM_KEY}`,
          `arn:aws:ssm:${region ?? '*'}:${account ?? '*'}:parameter${NEXUS_PASSWORD_SSM_KEY}`,
          `arn:aws:kms:${region ?? '*'}:${account ?? '*'}:key/*`,
        ]
      }));

      return buildRole;
    }

    // static buildEksDeployRole (scope:Construct, env:string, repositoryName:string, account:string):IRole {
    //   // Role should be created with EKS cluster and mapped to admin group
    //   const roleName = `money-eks-${repositoryName.toLocaleLowerCase()}-deploy-${env.toLocaleLowerCase()}`;
    //   const eksRole =  Role.fromRoleArn(
    //     scope,
    //     roleName,
    //     'arn:aws:iam::737245153745:role/eks-deploy'
    //   );

    //   // new Role(scope, roleName, {
    //   //   roleName: roleName,
    //   //   assumedBy: new CompositePrincipal(
    //   //     new ServicePrincipal('codebuild.amazonaws.com')
    //   //   )
    //   // });

    //   // eksRole.addToPrincipalPolicy(new PolicyStatement({
    //   //   effect: Effect.ALLOW,
    //   //   actions: [
    //   //     'sts:AssumeRole',
    //   //   ],
    //   //   resources: [
    //   //     `arn:aws:iam::${account}:role/eks-deploy`
    //   //   ]
    //   // }));
  
    //   // eksRole.addToPrincipalPolicy(new PolicyStatement({
    //   //   effect: Effect.ALLOW,
    //   //   actions: [
    //   //     'eks:DescribeNodegroup',
    //   //     'eks:DescribeUpdate',
    //   //     'eks:DescribeCluster',
    //   //   ],
    //   //   resources: ['*']
    //   // }));

    //   // eksRole.addToPrincipalPolicy(new PolicyStatement({
    //   //   effect: Effect.ALLOW,
    //   //   actions: [
    //   //     's3:GetObject*',
    //   //     's3:GetBucket*',
    //   //     's3:List*',
    //   //     's3:DeleteObject*',
    //   //     's3:PutObject',
    //   //     's3:Abort*',
    //   //   ],
    //   //   resources: [
    //   //     `arn:aws:s3:::${K8S_TEMPLATES_BUCKET_NAME}/*`,
    //   //     `arn:aws:s3:::${K8S_TEMPLATES_BUCKET_NAME} .k8s/`,
    //   //     `arn:aws:s3:::${K8S_TEMPLATES_BUCKET_NAME}`
    //   //   ]
    //   // }))

    //   return eksRole;
    // }

    static buildCodeBuildReleaseRole (scope:Construct, eksEnv:string, repositoryName:string, account:string, region:string):IRole {
      const roleName = `money-eks-${repositoryName.toLocaleLowerCase()}-release-${eksEnv.toLocaleLowerCase()}`;
      const role = new Role(scope, roleName, {
        roleName: roleName,
        assumedBy: new CompositePrincipal(
          new ServicePrincipal('codebuild.amazonaws.com'),
          new ServicePrincipal('codepipeline.amazonaws.com')
        ),
      });

      role.addToPrincipalPolicy(new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          'sts:AssumeRole',
          'ecr:GetAuthorizationToken',
          'secretsmanager:ListSecrets',
        ],
        resources: ['*']
      }));

      role.addToPrincipalPolicy(new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          'secretsmanager:GetResourcePolicy',
          'secretsmanager:GetSecretValue',
          'secretsmanager:DescribeSecret',
          'secretsmanager:ListSecretVersionIds',
          ],
        resources: [
          `arn:aws:secretsmanager:${region ?? '*'}:${account ?? '*'}:secret:${GITHUB_TOKEN_SECRET_NAME}-*`,
        ]
      }));

      role.addToPrincipalPolicy(new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          'ecr:BatchGetImage',
          'ecr:BatchCheckLayerAvailability',
          'ecr:CompleteLayerUpload',
          'ecr:InitiateLayerUpload',
          'ecr:GetDownloadUrlForLayer',
          'ecr:PutImage',
          'ecr:UploadLayerPart'
        ],
        resources: [
          `arn:aws:ecr:${ECR_REGION}:${account}:repository/${repositoryName}`
        ]
      }));

      role.addToPrincipalPolicy(new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          'codebuild:StartBuild'
        ],
        resources: [
          `arn:aws:codebuild:${ECR_REGION}:${account}:project/*`
        ]
      }));

      return role;
    }
}