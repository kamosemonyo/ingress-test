import { RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { aws_s3 as s3 } from 'aws-cdk-lib';
import { aws_s3_deployment as s3Deploy } from 'aws-cdk-lib';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

import { S3_DEPLOYMENT_INGRESS_BUCKET, S3_DEPLOYMENT_TEMP_BUCKET, S3_SECRETS_BUCKET } from './constants';

interface stackProps extends StackProps {};

export class K8sTemplatesS3Bucket extends Stack {
  bucket: s3.IBucket;

  constructor(scope: Construct, id: string, props: stackProps) {
    super(scope, id, props);

    this.bucket = new s3.Bucket(this, 'DeploymentTemplatesBucket', {
      bucketName: S3_DEPLOYMENT_TEMP_BUCKET,
      versioned: true,
      autoDeleteObjects: true,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    new s3Deploy.BucketDeployment(this, 'DeployWebsite', {
      sources: [s3Deploy.Source.asset('./deployment_templates/k8s-templates')],
      destinationBucket: this.bucket,
      contentType: 'text/plain',
    });

    const kongTemplates = new Bucket(this, 'IngressDeplopymentBucket', {
      bucketName: S3_DEPLOYMENT_INGRESS_BUCKET,
      versioned: true,
      autoDeleteObjects: true,
      removalPolicy: RemovalPolicy.DESTROY
    });

    new s3Deploy.BucketDeployment(this, 'KongDeployTemplates', {
      sources: [s3Deploy.Source.asset('./deployment_templates/kong-templates')],
      destinationBucket: kongTemplates,
      contentType: 'text/plain',
    });

    // new Bucket(this, 'MoneyK8sSecretsBucket', {
    //   bucketName: S3_SECRETS_BUCKET,
    //   versioned: true,
    //   autoDeleteObjects: true,
    //   removalPolicy: RemovalPolicy.DESTROY
    // });
  }
};
