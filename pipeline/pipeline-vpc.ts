import { Vpc } from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import { CODE_BUILD_VPC_NAME } from "../lib/constants";



export function getPipelineVPC (scope: Construct) {
  return Vpc.fromLookup(scope, 'CodeBuildVpc', {
    vpcName: CODE_BUILD_VPC_NAME,
    isDefault: false,
  });
}