import { ApplicationListener, ApplicationLoadBalancer } from "@aws-cdk/aws-elasticloadbalancingv2";
import { Construct, Stack, StackProps } from "@aws-cdk/core"
import { IVpc, SubnetFilter, SubnetType } from '@aws-cdk/aws-ec2';
import { environmentConfig } from "../lib/config";
import { toValidConstructName } from "../lib/util";
import { FargateService } from "@aws-cdk/aws-ecs";

interface parameters extends StackProps {
  vpc: IVpc
  serviceName: string
  service: FargateService
  listenPort?: number
  healthPath: string
  environmentConfig: environmentConfig
}

const defaultListenPort: number = 8080;

export const createEcsServiceLoadBalancer = (scope: Construct, props: parameters): ALBStack => {
  return new ALBStack(scope, `${toValidConstructName(props.serviceName)}ALB`, props);
};

class ALBStack extends Stack {
  loadBalancer: ApplicationLoadBalancer;
  httpListener: ApplicationListener;
  httpsListener: ApplicationListener;

  constructor(scope: Construct, id: string, props: parameters) {
    super(scope, id, props);

    this.loadBalancer = new ApplicationLoadBalancer(this, 'ALB', {
      vpc: props.vpc,
      internetFacing: false,
      deletionProtection: true,
      vpcSubnets: {
        subnetType: SubnetType.PRIVATE,
        subnetFilters: [SubnetFilter.byIds(props.environmentConfig.subnetIds)],
        availabilityZones: props.environmentConfig.availabilityZones,
      }
    });

    this.httpListener = this.loadBalancer.addListener('Listener', {
      port: 80,
    });

    this.httpsListener = this.loadBalancer.addListener('Listener', {
      port: 443,
    });

    this.httpListener.addTargets(`${props.serviceName}ECS`, {
      port: 80,
      targets: [
        props.service.loadBalancerTarget({
          containerName: props.serviceName,
          containerPort: props.listenPort ?? defaultListenPort,
        }),
      ],
    })
  }
}